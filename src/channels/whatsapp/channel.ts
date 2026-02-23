import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { TaskRunner } from '../../agent/taskRunner';
import type { RuntimeConfig, AgentRuntime } from '../../engine/types';
import { readTelecodeSettings } from '../../config/settings';
import { getPromptStackSignature } from '../../prompts/promptStack';
import type { IChannel } from '../types';
import { isWhatsappSenderAllowed } from './access';

const WA_MESSAGE_LIMIT = 3000;
const WA_BOT_PREFIX = '[Bot] ';

function splitText(input: string, limit = WA_MESSAGE_LIMIT): string[] {
  const text = input.trim();
  if (!text) return ['Done.'];
  if (text.length <= limit) return [text];
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    out.push(text.slice(i, i + limit));
    i += limit;
  }
  return out;
}

function expandHome(inputPath: string): string {
  if (!inputPath.startsWith('~')) return inputPath;
  return path.join(os.homedir(), inputPath.slice(1));
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

type WaClient = {
  on: (event: string, handler: (...args: any[]) => void) => void;
  initialize: () => Promise<void>;
  destroy: () => Promise<void>;
  sendMessage: (to: string, body: string) => Promise<unknown>;
  getState?: () => Promise<string | null>;
  attachEventListeners?: () => Promise<void>;
  pupPage?: {
    on?: (event: string, handler: (...args: any[]) => void) => void;
    evaluate?: <T>(fn: () => T | Promise<T>) => Promise<T>;
  };
};

type QrSvgRenderer = {
  toString: (text: string, options?: Record<string, unknown>) => Promise<string>;
};

type InjectedStoreModule = {
  ExposeStore?: () => void;
};

type InjectedUtilsModule = {
  LoadUtils?: () => void;
};

type WhatsAppProbeState = {
  hasStore: boolean;
  hasWWebJS: boolean;
  appState: string | null;
};

type IncomingCommand = 'help' | 'status' | 'stop' | 'run' | null;

function unwrapModule<T>(mod: T | { default?: T }): T {
  if (mod && typeof mod === 'object' && 'default' in (mod as object)) {
    const defaultValue = (mod as { default?: T }).default;
    if (defaultValue) return defaultValue;
  }
  return mod as T;
}

export class WhatsAppChannel implements IChannel {
  public readonly id = 'whatsapp';
  public readonly name = 'WhatsApp';

  private client: WaClient | null = null;
  private qrSvgRenderer: QrSvgRenderer | null = null;
  private active = false;
  private isProcessing = false;
  private authLogged = false;
  private startupWatchdog: NodeJS.Timeout | null = null;
  private readyFallbackTimer: NodeJS.Timeout | null = null;
  private pageDebugHooksAttached = false;
  private destroyInFlight: Promise<void> | null = null;
  private runtimeConfigSignature = '';
  private readonly logs: string[] = [];
  private readonly seenMessageIds = new Map<string, number>();
  private readonly seenIncomingFingerprints = new Map<string, number>();
  private readonly recentOutgoingTexts = new Map<string, number>();
  private startupGreetingSent = false;
  private currentChatId: string | null = null;

  private taskRunner: TaskRunner;

  constructor(
    private readonly tools: AgentTool[],
    private readonly onLog?: (line: string) => void,
    private readonly onStatus?: (status: string) => void
  ) {
    this.taskRunner = new TaskRunner(
      () => {
        // event streaming is handled per task subscription
      },
      (state) => {
        if (state === 'error' || state === 'idle' || state === 'stopped') {
          this.isProcessing = false;
        }
      },
      180_000,
      process.cwd()
    );
  }

  public isActive(): boolean {
    return this.active;
  }

  public async start(): Promise<void> {
    this.stop();
    if (this.destroyInFlight) {
      await this.destroyInFlight;
    }
    this.startupGreetingSent = false;

    const settings = readTelecodeSettings();
    if (!settings.whatsapp.enabled) {
      this.pushLog('[whatsapp] disabled');
      this.setStatus('Idle');
      return;
    }

    const sessionPath = expandHome(settings.whatsapp.sessionPath);
    const sessionDir = path.extname(sessionPath) ? path.dirname(sessionPath) : sessionPath;
    await ensureDir(sessionDir);

    let wa: any;
    try {
      wa = unwrapModule(await import('whatsapp-web.js'));
    } catch {
      this.pushLog('[whatsapp:error] missing dependency "whatsapp-web.js". Run: npm i whatsapp-web.js');
      this.setStatus('Error');
      return;
    }

    try {
      this.qrSvgRenderer = unwrapModule(await import('qrcode'));
    } catch {
      this.qrSvgRenderer = null;
      this.pushLog('[whatsapp:error] missing dependency "qrcode". Run: npm i qrcode');
      this.setStatus('Error');
      return;
    }

    const { Client, LocalAuth } = wa;

    const client: WaClient = new Client({
      authStrategy: new LocalAuth({
        clientId: 'telecode-ai',
        dataPath: sessionDir,
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    client.on('qr', (qr: string) => {
      this.clearStartupWatchdog();
      this.setStatus('Connecting');
      this.authLogged = false;
      this.pushLog('[whatsapp] scan QR in your terminal to authorize WhatsApp session');
      void this.emitQrSvgToLogs(qr);
    });

    client.on('ready', () => {
      this.clearStartupWatchdog();
      this.clearReadyFallbackTimer();
      this.active = true;
      this.setStatus('Ready');
      this.pushLog('[whatsapp] client ready');
      void this.sendStartupGreeting();
    });

    client.on('authenticated', () => {
      this.clearStartupWatchdog();
      this.active = true;
      this.setStatus('Ready');
      if (this.authLogged) return;
      this.authLogged = true;
      this.pushLog('[whatsapp] authenticated');
      void this.sendStartupGreeting();
      this.scheduleReadyFallback();
    });

    client.on('loading_screen', (percent: number, message: string) => {
      this.pushLog(`[whatsapp] loading ${percent}%${message ? ` (${message})` : ''}`);
    });

    client.on('change_state', (state: string) => {
      this.pushLog(`[whatsapp] state ${state}`);
      const normalized = state.trim().toUpperCase();
      if (normalized === 'CONNECTED' || normalized === 'OPENING') {
        this.active = true;
        this.setStatus('Ready');
        this.clearReadyFallbackTimer();
      }
    });

    client.on('remote_session_saved', () => {
      this.pushLog('[whatsapp] session saved');
    });

    client.on('auth_failure', (message: string) => {
      this.clearStartupWatchdog();
      this.active = false;
      this.setStatus('Error');
      this.pushLog(`[whatsapp:error] auth failure: ${message || 'unknown'}`);
    });

    client.on('disconnected', (reason: string) => {
      this.clearStartupWatchdog();
      this.clearReadyFallbackTimer();
      this.active = false;
      this.authLogged = false;
      this.setStatus('Idle');
      this.pushLog(`[whatsapp] disconnected: ${reason || 'unknown'}`);
    });

    client.on('message', (msg: any) => {
      void this.handleMessage(msg);
    });

    client.on('message_create', (msg: any) => {
      void this.handleMessage(msg);
    });

    this.client = client;
    this.attachPageDebugHooks(client);
    this.setStatus('Connecting');
    this.pushLog(`[whatsapp] starting (sessionDir=${sessionDir})`);
    this.pushLog('[whatsapp] initializing web client...');
    this.startupWatchdog = setTimeout(() => {
      if (!this.active) {
        this.pushLog('[whatsapp:warn] still waiting for QR/ready (check Chrome/Puppeteer availability)');
      }
    }, 12_000);
    try {
      await client.initialize();
      this.pushLog('[whatsapp] initialize resolved');
    } catch (error) {
      this.clearStartupWatchdog();
      const message = error instanceof Error ? error.message : String(error);
      this.pushLog(`[whatsapp:error] initialize failed: ${message}`);
      this.setStatus('Error');
      this.client = null;
      void client.destroy().catch(() => {
        // ignore teardown errors after failed initialize
      });
    }
  }

  public stop(): void {
    const current = this.client;
    this.client = null;
    this.active = false;
    this.isProcessing = false;
    this.authLogged = false;
    this.startupGreetingSent = false;
    this.clearStartupWatchdog();
    this.clearReadyFallbackTimer();
    this.currentChatId = null;
    this.runtimeConfigSignature = '';
    this.taskRunner.abortCurrentRun();
    this.setStatus('Idle');

    if (current) {
      const destroyPromise = current
        .destroy()
        .catch(() => {
          // ignore shutdown errors
        })
        .finally(() => {
          if (this.destroyInFlight === destroyPromise) {
            this.destroyInFlight = null;
          }
        });
      this.destroyInFlight = destroyPromise;
      this.pushLog('[whatsapp] stopped');
    }
  }

  public stopCurrentTask(): void {
    if (!this.isProcessing) return;
    this.taskRunner.abortCurrentRun();
    this.isProcessing = false;
    this.setStatus('Idle');
    this.pushLog('[whatsapp] current task stopped');
  }

  private async handleMessage(msg: any): Promise<void> {
    const settings = readTelecodeSettings();
    const chatId = typeof msg?.from === 'string' ? msg.from : null;
    const body = typeof msg?.body === 'string' ? msg.body.trim() : '';
    const fromMe = msg?.fromMe === true;
    const command = this.parseCommand(body);
    const messageId = this.extractMessageId(msg);

    if (!chatId || !body) {
      this.pushLog('[whatsapp:warn] dropped incoming message (missing chatId/body)');
      return;
    }
    if (!isWhatsappSenderAllowed({
      mode: settings.whatsapp.accessMode,
      allowedPhones: settings.whatsapp.allowedPhones,
      fromMe,
      msg,
      chatId,
    })) {
      this.pushLog('[whatsapp] blocked message by access policy');
      return;
    }
    this.currentChatId = chatId;
    void this.saveLastChatId(chatId);
    if (body.includes(WA_BOT_PREFIX.trim())) {
      return;
    }
    if (messageId && this.isDuplicateMessage(messageId)) {
      return;
    }
    if (this.isDuplicateIncomingText(chatId, body)) {
      return;
    }
    // Critical anti-loop guard: in some WA event paths bot messages can be
    // re-emitted as if they were incoming. Ignore anything that matches a
    // recent outgoing message payload.
    if (this.isLikelyOwnOutgoing(body)) {
      return;
    }

    // Prevent self-chat loops, but allow plain-text self messages if they are
    // not generated by the bot itself.
    if (fromMe && !settings.whatsapp.allowSelfCommands) {
      return;
    }
    if (fromMe && !command && this.isLikelyOwnOutgoing(body)) {
      return;
    }

    if (command === 'help') {
      await this.sendMessageSafe(
        chatId,
        'Commands:\n/status — current state\n/stop — stop current run\n/run <task> — run a task (required in self-chat)',
        '/help'
      );
      return;
    }

    if (command === 'status') {
      await this.sendMessageSafe(chatId, this.isProcessing ? 'Agent status: running' : 'Agent status: ready', '/status');
      return;
    }

    if (command === 'stop') {
      this.stopCurrentTask();
      await this.sendMessageSafe(chatId, 'Stopped current run.', '/stop');
      return;
    }

    if (this.isProcessing) {
      await this.sendMessageSafe(chatId, 'Agent is busy. Wait for completion or send /stop.', 'busy');
      return;
    }

    const taskText = command === 'run' ? body.slice(5).trim() : body;
    if (!taskText) {
      await this.sendMessageSafe(chatId, 'Usage: /run <task>', '/run');
      return;
    }

    this.isProcessing = true;
    this.currentChatId = chatId;
    this.setStatus('Running');
    this.pushLog(`[whatsapp] task from ${chatId}: ${taskText.slice(0, 180)}`);

    const runtime = this.ensureRuntime();
    let output = '';
    const unsub = runtime.onEvent((event) => {
      if (event.type === 'text_delta') {
        output += event.delta;
      }
    });

    try {
      await this.taskRunner.runTask(taskText);
      if (!this.client || !this.active) {
        this.pushLog('[whatsapp] task aborted');
        return;
      }
      const chunks = splitText(output || 'Done.');
      for (const chunk of chunks) {
        await this.sendMessageSafe(chatId, chunk);
      }
      this.pushLog('[whatsapp] task done');
      this.setStatus('Ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.client?.sendMessage(chatId, `Task failed: ${message}`);
      this.pushLog(`[whatsapp:error] ${message}`);
      this.setStatus('Error');
    } finally {
      unsub();
      this.isProcessing = false;
    }
  }

  private ensureRuntime(): AgentRuntime {
    const settings = readTelecodeSettings();
    const config: RuntimeConfig = {
      ...settings.agent,
      cwd: process.cwd(),
      language: settings.agent.language === 'auto' ? undefined : settings.agent.language,
    };

    const signature = JSON.stringify({
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl || '',
      maxSteps: config.maxSteps,
      apiKeySet: config.apiKey.length > 0,
      allowedTools: config.allowedTools,
      tools: this.tools.map((tool) => tool.name),
      language: config.language,
      responseStyle: config.responseStyle,
      promptSignature: getPromptStackSignature(config.cwd),
    });

    if (this.taskRunner.getRuntime && this.runtimeConfigSignature === signature) {
      return this.taskRunner.getRuntime;
    }

    this.pushLog(`[whatsapp] initializing runtime (engine=${settings.agent.provider})`);
    const runtime = this.taskRunner.initRuntime(config, this.tools);
    this.runtimeConfigSignature = signature;
    return runtime;
  }

  private pushLog(line: string): void {
    const entry = `[${new Date().toLocaleTimeString()}] ${line}`;
    this.logs.push(entry);
    while (this.logs.length > 300) this.logs.shift();
    this.onLog?.(entry);
  }

  private async emitQrSvgToLogs(qr: string): Promise<void> {
    if (!this.qrSvgRenderer) return;
    try {
      const svg = await this.qrSvgRenderer.toString(qr, {
        type: 'svg',
        width: 260,
        margin: 1,
        color: {
          dark: '#1d232f',
          light: '#ffffff',
        },
      });
      const payload = Buffer.from(svg, 'utf8').toString('base64');
      this.pushLog('[whatsapp:qrsvg] scan this QR in WhatsApp (Linked Devices)');
      this.pushLog(`[whatsapp:qrsvg] ${payload}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.pushLog(`[whatsapp:warn] failed to render SVG QR: ${message}`);
    }
  }

  private setStatus(status: string): void {
    this.onStatus?.(status);
  }

  private parseCommand(body: string): IncomingCommand {
    if (body.startsWith('/help')) return 'help';
    if (body.startsWith('/status')) return 'status';
    if (body.startsWith('/stop')) return 'stop';
    if (body.startsWith('/run ')) return 'run';
    return null;
  }

  private extractMessageId(msg: any): string | null {
    const serialized = msg?.id?._serialized;
    if (typeof serialized === 'string' && serialized.length > 0) return serialized;
    const id = msg?.id?.id;
    if (typeof id === 'string' && id.length > 0) return id;
    return null;
  }

  private isDuplicateMessage(messageId: string): boolean {
    const now = Date.now();
    for (const [id, ts] of this.seenMessageIds.entries()) {
      if (now - ts > 90_000) {
        this.seenMessageIds.delete(id);
      }
    }
    if (this.seenMessageIds.has(messageId)) {
      return true;
    }
    this.seenMessageIds.set(messageId, now);
    return false;
  }

  private async sendMessageSafe(chatId: string, text: string, label?: string): Promise<boolean> {
    try {
      const prefixed = `${WA_BOT_PREFIX}${text}`;
      await this.client?.sendMessage(chatId, prefixed);
      this.trackOutgoingText(prefixed);
      if (label) {
        this.pushLog(`[whatsapp] ${label} reply sent`);
      }
      return true;
    } catch (error) {
      if (!label) return false;
      const message = error instanceof Error ? error.message : String(error);
      this.pushLog(`[whatsapp:error] ${label} reply failed: ${message}`);
      return false;
    }
    return false;
  }

  private getStartupMessage(): string {
    const settings = readTelecodeSettings();
    const lang = settings.agent.language;
    if (lang === 'ru') {
      return 'TeleCode AI подключен. Отправьте /status';
    }
    if (lang === 'en') {
      return 'TeleCode AI connected. Send /status';
    }
    return 'TeleCode AI подключен. Отправьте /status\nTeleCode AI connected. Send /status';
  }

  private async sendStartupGreeting(): Promise<void> {
    if (this.startupGreetingSent) return;
    const chatId = this.currentChatId || (await this.loadLastChatId());
    if (!chatId) {
      this.pushLog('[whatsapp] startup greeting skipped (no known chatId yet)');
      return;
    }
    const sent = await this.sendMessageSafe(chatId, this.getStartupMessage(), 'startup');
    if (sent) {
      this.startupGreetingSent = true;
    }
  }

  private getLastChatFilePath(): string {
    return path.join(os.homedir(), '.telecode-ai', 'whatsapp-last-chat.txt');
  }

  private async loadLastChatId(): Promise<string | null> {
    try {
      const raw = await fs.readFile(this.getLastChatFilePath(), 'utf8');
      const value = raw.trim();
      return value.length > 0 ? value : null;
    } catch {
      return null;
    }
  }

  private async saveLastChatId(chatId: string): Promise<void> {
    try {
      const file = this.getLastChatFilePath();
      await ensureDir(path.dirname(file));
      await fs.writeFile(file, chatId, 'utf8');
    } catch {
      // ignore persistence errors
    }
  }

  private normalizeMessageText(text: string): string {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private trackOutgoingText(text: string): void {
    const normalized = this.normalizeMessageText(text);
    if (!normalized) return;
    const now = Date.now();
    this.recentOutgoingTexts.set(normalized, now);
    for (const [key, ts] of this.recentOutgoingTexts.entries()) {
      if (now - ts > 30_000) {
        this.recentOutgoingTexts.delete(key);
      }
    }
  }

  private isLikelyOwnOutgoing(text: string): boolean {
    const normalized = this.normalizeMessageText(text);
    if (!normalized) return false;
    const ts = this.recentOutgoingTexts.get(normalized);
    if (!ts) return false;
    return Date.now() - ts <= 15_000;
  }

  private isDuplicateIncomingText(chatId: string, text: string): boolean {
    const normalized = this.normalizeMessageText(text);
    if (!normalized) return false;
    const now = Date.now();
    const key = `${chatId}|${normalized}`;
    for (const [fingerprint, ts] of this.seenIncomingFingerprints.entries()) {
      if (now - ts > 3_000) {
        this.seenIncomingFingerprints.delete(fingerprint);
      }
    }
    const existing = this.seenIncomingFingerprints.get(key);
    if (existing && now - existing < 2_500) {
      return true;
    }
    this.seenIncomingFingerprints.set(key, now);
    return false;
  }

  private clearStartupWatchdog(): void {
    if (this.startupWatchdog) {
      clearTimeout(this.startupWatchdog);
      this.startupWatchdog = null;
    }
  }

  private scheduleReadyFallback(): void {
    this.clearReadyFallbackTimer();
    this.readyFallbackTimer = setTimeout(() => {
      if (!this.active) return;
      const settings = readTelecodeSettings();
      if (!settings.whatsapp.recoveryOnAuth) {
        this.pushLog('[whatsapp:warn] ready event missing (recovery disabled)');
        return;
      }
      this.pushLog('[whatsapp] ready event missing, attempting recovery');
      void this.attemptPostAuthRecovery();
    }, 3_000);
  }

  private clearReadyFallbackTimer(): void {
    if (this.readyFallbackTimer) {
      clearTimeout(this.readyFallbackTimer);
      this.readyFallbackTimer = null;
    }
  }

  private attachPageDebugHooks(client: WaClient): void {
    if (this.pageDebugHooksAttached) return;
    const page = client.pupPage;
    const on = page?.on;
    if (!on) return;
    this.pageDebugHooksAttached = true;
    on.call(page, 'console', (msg: { type?: () => string; text?: () => string }) => {
      try {
        const text = msg?.text ? msg.text() : '';
        const type = msg?.type ? msg.type() : 'log';
        if (!text) return;
        if (type === 'error' || /\b(error|exception|failed)\b/i.test(text)) {
          this.pushLog(`[whatsapp:page:${type}] ${text.slice(0, 260)}`);
        }
      } catch {
        // ignore debug logging failures
      }
    });
    on.call(page, 'pageerror', (err: Error) => {
      const message = err instanceof Error ? err.message : String(err);
      this.pushLog(`[whatsapp:page:error] ${message}`);
    });
  }

  private async attemptPostAuthRecovery(): Promise<void> {
    const client = this.client;
    if (!client) return;

    try {
      if (typeof client.getState === 'function') {
        const state = await client.getState();
        this.pushLog(`[whatsapp] state probe: ${state ?? 'null'}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.pushLog(`[whatsapp:warn] getState failed: ${message}`);
    }

    try {
      const page = client.pupPage;
      const evaluate = page?.evaluate;
      if (!evaluate) return;
      const probe = await evaluate.call(page, () => {
        const g = globalThis as Record<string, unknown>;
        const authStore = (g.AuthStore || {}) as Record<string, unknown>;
        const appState = (authStore.AppState || {}) as Record<string, unknown>;
        return {
          hasStore: typeof g.Store !== 'undefined',
          hasWWebJS: typeof g.WWebJS !== 'undefined',
          appState: typeof appState.state === 'string' ? appState.state : null,
        };
      }) as WhatsAppProbeState;

      if (!probe.hasStore) {
        try {
          const storeMod = unwrapModule(await import('whatsapp-web.js/src/util/Injected/Store.js')) as InjectedStoreModule;
          if (typeof storeMod.ExposeStore === 'function' && evaluate) {
            await evaluate.call(page, storeMod.ExposeStore);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.pushLog(`[whatsapp:warn] recovery ExposeStore failed: ${message}`);
        }
      }

      const probeAfter = await evaluate.call(page, () => {
        const g = globalThis as Record<string, unknown>;
        const authStore = (g.AuthStore || {}) as Record<string, unknown>;
        const appState = (authStore.AppState || {}) as Record<string, unknown>;
        return {
          hasStore: typeof g.Store !== 'undefined',
          hasWWebJS: typeof g.WWebJS !== 'undefined',
          appState: typeof appState.state === 'string' ? appState.state : null,
        };
      }) as WhatsAppProbeState;

      if (probeAfter.hasStore) {
        try {
          const utilsMod = unwrapModule(await import('whatsapp-web.js/src/util/Injected/Utils.js')) as InjectedUtilsModule;
          if (typeof utilsMod.LoadUtils === 'function') {
            await evaluate.call(page, utilsMod.LoadUtils);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.pushLog(`[whatsapp:warn] recovery LoadUtils failed: ${message}`);
        }
      }

      const probeFinal = await evaluate.call(page, () => {
        const g = globalThis as Record<string, unknown>;
        const authStore = (g.AuthStore || {}) as Record<string, unknown>;
        const appState = (authStore.AppState || {}) as Record<string, unknown>;
        return {
          hasStore: typeof g.Store !== 'undefined',
          hasWWebJS: typeof g.WWebJS !== 'undefined',
          appState: typeof appState.state === 'string' ? appState.state : null,
        };
      }) as WhatsAppProbeState;

      if (probeFinal.hasStore && probeFinal.hasWWebJS && typeof client.attachEventListeners === 'function') {
        await client.attachEventListeners();
        this.pushLog('[whatsapp] recovery complete');
      } else {
        this.pushLog(
          `[whatsapp:warn] recovery incomplete (store=${probeFinal.hasStore ? '1' : '0'}, wwebjs=${probeFinal.hasWWebJS ? '1' : '0'}, state=${probeFinal.appState ?? 'null'})`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.pushLog(`[whatsapp:warn] recovery probe failed: ${message}`);
    }
  }
}
