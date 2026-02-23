import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { TaskRunner } from '../../agent/taskRunner';
import type { RuntimeConfig, AgentRuntime } from '../../engine/types';
import { readTelecodeSettings } from '../../config/settings';
import { getPromptStackSignature } from '../../prompts/promptStack';
import type { IChannel } from '../types';

const WA_MESSAGE_LIMIT = 3000;

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
};

type QrSvgRenderer = {
  toString: (text: string, options?: Record<string, unknown>) => Promise<string>;
};

export class WhatsAppChannel implements IChannel {
  public readonly id = 'whatsapp';
  public readonly name = 'WhatsApp';

  private client: WaClient | null = null;
  private qrSvgRenderer: QrSvgRenderer | null = null;
  private active = false;
  private isProcessing = false;
  private authLogged = false;
  private startupWatchdog: NodeJS.Timeout | null = null;
  private destroyInFlight: Promise<void> | null = null;
  private runtimeConfigSignature = '';
  private readonly logs: string[] = [];
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
      wa = await import('whatsapp-web.js');
    } catch {
      this.pushLog('[whatsapp:error] missing dependency "whatsapp-web.js". Run: npm i whatsapp-web.js');
      this.setStatus('Error');
      return;
    }

    try {
      this.qrSvgRenderer = await import('qrcode');
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
      this.active = true;
      this.setStatus('Ready');
      this.pushLog('[whatsapp] client ready');
    });

    client.on('authenticated', () => {
      this.clearStartupWatchdog();
      this.active = true;
      this.setStatus('Ready');
      if (this.authLogged) return;
      this.authLogged = true;
      this.pushLog('[whatsapp] authenticated');
    });

    client.on('loading_screen', (percent: number, message: string) => {
      this.pushLog(`[whatsapp] loading ${percent}%${message ? ` (${message})` : ''}`);
    });

    client.on('change_state', (state: string) => {
      this.pushLog(`[whatsapp] state ${state}`);
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
      this.active = false;
      this.authLogged = false;
      this.setStatus('Idle');
      this.pushLog(`[whatsapp] disconnected: ${reason || 'unknown'}`);
    });

    client.on('message', (msg: any) => {
      void this.handleMessage(msg);
    });

    this.client = client;
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
    this.clearStartupWatchdog();
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
    const chatId = typeof msg?.from === 'string' ? msg.from : null;
    const body = typeof msg?.body === 'string' ? msg.body.trim() : '';

    if (!chatId || !body) {
      return;
    }

    if (body.startsWith('/status')) {
      await this.client?.sendMessage(chatId, this.isProcessing ? 'Agent status: running' : 'Agent status: ready');
      return;
    }

    if (body.startsWith('/stop')) {
      this.stopCurrentTask();
      await this.client?.sendMessage(chatId, 'Stopped current run.');
      return;
    }

    if (this.isProcessing) {
      await this.client?.sendMessage(chatId, 'Agent is busy. Wait for completion or send /stop.');
      return;
    }

    this.isProcessing = true;
    this.currentChatId = chatId;
    this.setStatus('Running');
    this.pushLog(`[whatsapp] task from ${chatId}: ${body.slice(0, 180)}`);

    await this.client?.sendMessage(chatId, 'Запускаю задачу… / Starting task…');

    const runtime = this.ensureRuntime();
    let output = '';
    const unsub = runtime.onEvent((event) => {
      if (event.type === 'text_delta') {
        output += event.delta;
      }
    });

    try {
      await this.taskRunner.runTask(body);
      const chunks = splitText(output || 'Done.');
      for (const chunk of chunks) {
        await this.client?.sendMessage(chatId, chunk);
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

  private clearStartupWatchdog(): void {
    if (this.startupWatchdog) {
      clearTimeout(this.startupWatchdog);
      this.startupWatchdog = null;
    }
  }
}
