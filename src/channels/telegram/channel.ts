import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as https from 'node:https';
import { Bot, type Context } from 'grammy';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { readTelecodeSettings } from '../../config/settings';
import type { AgentRuntime, RuntimeConfig, ImageContentExt } from '../../engine/types';
import { getPromptStackSignature } from '../../prompts/promptStack';
import type { IChannel } from '../types';
import { TaskRunner } from '../../agent/taskRunner';
import { saveOpenSettingsFiles } from '../../utils/vscodeUtils';
import { i18n, type Translations } from '../../services/i18n';
import { TelegramApiService } from './api';
import { createTelegramTools } from './tools';
import { 
  limitText, splitPlainText, describeRuntimePhase, describeToolPhase, 
  summarizeToolArgs, summarizeToolResult, summarizeToolError, formatError,
  isLikelyNetworkError, parseTelegramChatId, getWorkspaceRoot, runGitCommand,
  rollbackWorkingTree, isRecord, shouldLogTelegramStatus, compactTelegramStatus
} from './utils';
import { markdownToTelegramHtmlChunks } from './renderer';

type NetworkMode = 'auto' | 'ipv4';

export class TelegramChannel implements IChannel {
  public readonly id = 'telegram';
  public readonly name = 'Telegram';

  private bot: Bot | null = null;
  private taskRunner: TaskRunner;
  private runtimeConfigSignature = '';
  private active = false;

  private isProcessing = false;

  private lastActivityAt = 0;
  private currentPhase = 'idle';
  private currentChatId: number | null = null;
  private activeTaskCleanup: (() => void) | null = null;

  private lastResponse = '';
  private readonly logs: string[] = [];

  constructor(
    private readonly tools: AgentTool[],
    private readonly onLog?: (line: string) => void,
    private readonly onStatus?: (status: string) => void
  ) {
    this.taskRunner = new TaskRunner(
      (_event) => {
        // Events will be forwarded in executeTask
      },
      (state) => {
         if (state === 'error' || state === 'idle' || state === 'stopped') {
             this.isProcessing = false;
         }
      },
      180_000,
      getWorkspaceRoot()
    );
  }

  public isActive(): boolean {
    return this.active;
  }

  public async start(): Promise<void> {
    this.stop();

    const settings = readTelecodeSettings();
    const { enabled, botToken, chatId, apiRoot, forceIPv4 } = settings.telegram;

    if (!enabled || !botToken) {
      this.pushLog('[telegram] disabled or missing bot token');
      this.setStatus('Idle');
      return;
    }

    try {
      const allowedChatId = parseTelegramChatId(chatId);
      if (chatId && allowedChatId === null) {
        const message = `TeleCode AI Telegram: invalid chatId "${chatId}". Use numeric id like 123456789 or -1001234567890.`;
        this.pushLog(`[error] ${message}`);
        vscode.window.showWarningMessage(message);
      }

      const preferredMode: NetworkMode = forceIPv4 ? 'ipv4' : 'auto';
      const fallbackMode: NetworkMode = preferredMode === 'ipv4' ? 'auto' : 'ipv4';

      this.bot = this.createBot(botToken, apiRoot, preferredMode);
      this.setStatus('Connecting');
      this.pushLog(
        `[telegram] starting (chatId=${allowedChatId !== null ? String(allowedChatId) : 'not-set'}, apiRoot=${apiRoot || 'default'}, mode=${preferredMode})`
      );

      try {
        await this.verifyBotConnectivity(this.bot);
      } catch (error) {
        const message = formatError(error);
        this.pushLog(`[telegram:error] token/webhook check failed - ${message}`);

        if (isLikelyNetworkError(error)) {
          this.pushLog(`[telegram] retrying connectivity with mode=${fallbackMode}`);
          this.bot = this.createBot(botToken, apiRoot, fallbackMode);
          await this.verifyBotConnectivity(this.bot);
          this.pushLog(`[telegram] connectivity recovered with mode=${fallbackMode}`);
        } else {
          throw error;
        }
      }

      this.bot.use(async (ctx, next) => {
        const text = ctx.message && 'text' in ctx.message ? (ctx.message.text || '').trim() : '';
        const incomingChatId = typeof ctx.chat?.id === 'number' ? String(ctx.chat.id) : '(unknown)';
        this.lastActivityAt = Date.now();
        this.pushLog(`[update] chat=${incomingChatId} text=${text || '(non-text)'}`);

        if (allowedChatId !== null && ctx.chat?.id !== allowedChatId) {
          const receivedChatId = typeof ctx.chat?.id === 'number' ? String(ctx.chat.id) : '(unknown)';
          this.pushLog(`[blocked] chat id ${receivedChatId}`);
          console.warn(`TeleCode AI Telegram: blocked chat id ${receivedChatId}`);
          try {
            await ctx.reply(
              `Access denied for chat ${receivedChatId}. Expected ${allowedChatId}. Update telecode.telegram.chatId in settings.`
            );
          } catch {
            // ignore reply errors for blocked users
          }
          return;
        }
        await next();
      });

      this.bot.command('start', async (ctx) => {
        await ctx.reply('TeleCode AI bot is online. Use /help to see commands.');
      });

      this.bot.command('help', async (ctx) => {
        await ctx.reply(this.renderHelp(this.getT()));
      });

      this.bot.command('status', async (ctx) => {
        await ctx.reply(this.renderStatus(this.getT()));
      });

      this.bot.command('settings', async (ctx) => {
        await ctx.reply(this.renderSettings(this.getT()));
      });

      this.bot.command('stop', async (ctx) => {
        this.stopCurrentTask();
        await ctx.reply('Stopped current run.');
      });

      this.bot.command('reset', async (ctx) => {
        this.taskRunner.clearHistorySync();
        await ctx.reply('Session history has been cleared.');
      });

      this.bot.command('last', async (ctx) => {
        if (!this.lastResponse) {
          await ctx.reply('No completed runs yet.');
          return;
        }
        await this.replyMarkdown(ctx, this.lastResponse);
      });

      this.bot.command('logs', async (ctx) => {
        const text = ctx.match;
        const args = typeof text === 'string' ? text.trim() : '';
        const requested = args ? Number.parseInt(args, 10) : 20;
        const count = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 100) : 20;

        const lines = this.logs.slice(-count);
        await ctx.reply(lines.length > 0 ? lines.join('\n') : 'No logs yet.');
      });

      this.bot.command('changes', async (ctx) => {
        const { stdout } = await runGitCommand(['status', '--porcelain']);
        await ctx.reply(stdout.trim().length > 0 ? limitText(stdout) : 'No working tree changes.');
      });

      this.bot.command('diff', async (ctx) => {
        const text = ctx.match;
        const args = typeof text === 'string' ? text.trim() : '';
        if (!args) {
          await ctx.reply('Usage: /diff <relative-file-path>');
          return;
        }

        const { stdout } = await runGitCommand(['diff', '--', args]);
        await ctx.reply(stdout.trim().length > 0 ? limitText(stdout) : `No diff for ${args}`);
      });

      this.bot.command('rollback', async (ctx) => {
        const result = await rollbackWorkingTree();
        await ctx.reply(result);
      });

      this.bot.command('api', async (ctx) => {
        const text = ctx.match;
        const args = typeof text === 'string' ? text.trim() : '';
        if (!args) {
          await ctx.reply('Usage: /api <method> [json params]\nExample: /api getChat {"chat_id":123456789}');
          return;
        }

        try {
          const apiService = new TelegramApiService(this.bot, (l) => this.pushLog(l));
          const parsed = this.parseRawApiCommand(args);
          const workspaceRoot = getWorkspaceRoot();
          const preparedParams = await apiService.prepareParams(parsed.params, workspaceRoot);
          const response = await apiService.callApi(parsed.method, preparedParams);
          const serialized = JSON.stringify(response, null, 2);
          await this.replyMarkdown(ctx, `\`\`\`json\n${serialized}\n\`\`\``);
        } catch (error) {
          const message = formatError(error);
          this.pushLog(`[telegram:api:error] ${message}`);
          await ctx.reply(limitText(`API call failed: ${message}`));
        }
      });

      this.bot.command('model', async (ctx) => {
        const text = ctx.match;
        const args = typeof text === 'string' ? text.trim() : '';
        if (!args) {
          await ctx.reply('Usage: /model <model-id>');
          return;
        }

        await this.updateSetting('model', args);
        await ctx.reply(`Model updated to ${args}`);
      });

      this.bot.command('provider', async (ctx) => {
        const text = ctx.match;
        const args = typeof text === 'string' ? text.trim() : '';
        if (!args) {
          await ctx.reply('Usage: /provider <provider-id>');
          return;
        }

        await this.updateSetting('provider', args);
        await ctx.reply(`Provider updated to ${args}`);
      });

      this.bot.command('style', async (ctx) => {
        const text = ctx.match;
        const args = (typeof text === 'string' ? text.trim() : '').toLowerCase();
        if (!args || !['concise', 'normal', 'detailed'].includes(args)) {
          await ctx.reply('Usage: /style <concise|normal|detailed>');
          return;
        }

        await this.updateSetting('responseStyle', args);
        await ctx.reply(`Response style updated to ${args}`);
      });

      this.bot.command('language', async (ctx) => {
        const text = ctx.match;
        const args = (typeof text === 'string' ? text.trim() : '').toLowerCase();
        if (!args || !['ru', 'en'].includes(args)) {
          await ctx.reply('Usage: /language <ru|en>');
          return;
        }

        await this.updateSetting('language', args);
        await ctx.reply(`Language updated to ${args}`);
      });

      this.bot.command('run', async (ctx) => {
        const text = ctx.match;
        const task = typeof text === 'string' ? text.trim() : '';
        if (!task) {
          await ctx.reply('Usage: /run <task>');
          return;
        }

        await this.executeTask(ctx, task);
      });

      this.bot.on('message:text', async (ctx) => {
        const text = ctx.message?.text?.trim() || '';
        if (!text || text.startsWith('/')) {
          return;
        }

        await this.executeTask(ctx, text);
      });

      this.bot.on('message:photo', async (ctx) => {
        const text = ctx.message?.caption?.trim() || '';
        if (text.startsWith('/')) {
          return;
        }

        const photos = ctx.message?.photo;
        if (!photos || photos.length === 0) return;

        try {
          const largestPhoto = photos[photos.length - 1];
          const file = await ctx.api.getFile(largestPhoto.file_id);
          const url = `https://api.telegram.org/file/bot${this.bot!.token}/${file.file_path}`;
          
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to download photo: ${response.statusText}`);
          }
          
          const buffer = await response.arrayBuffer();
          const base64Data = Buffer.from(buffer).toString('base64');
          
          const images: ImageContentExt[] = [{
            type: 'image',
            data: base64Data,
            mimeType: 'image/jpeg',
          }];

          await this.executeTask(ctx, text || 'Explain or analyze this image', images);
        } catch (error) {
          const errStr = error instanceof Error ? error.message : String(error);
          this.pushLog(`[telegram:error] downloading photo: ${errStr}`);
          await ctx.reply('Failed to process image.');
        }
      });

      this.bot.catch((error) => {
        this.pushLog(`[telegram:error] ${formatError(error)}`);
        console.error('TeleCode AI Telegram error:', error);
      });

      await this.bot.start({
        onStart: (botInfo) => {
          this.active = true;
          this.lastActivityAt = Date.now();
          this.setStatus('Idle');
          this.pushLog(`[telegram] started as @${botInfo.username}`);
          console.log(`TeleCode AI Telegram started as @${botInfo.username}`);
          vscode.window.showInformationMessage(`TeleCode AI: Telegram bot started (@${botInfo.username})`);
          if (allowedChatId !== null) {
            void this.bot?.api
              .sendMessage(allowedChatId, 'TeleCode AI connected. Send /status')
              .catch((error) => this.pushLog(`[telegram:error] startup ping failed - ${formatError(error)}`));
          }
        },
      });
    } catch (error) {
      this.active = false;
      this.setStatus('Error');
      const message = formatError(error);
      this.pushLog(`[telegram:error] failed to start - ${message}`);
      vscode.window.showErrorMessage(`TeleCode AI: failed to start Telegram bot - ${message}`);
      console.error(error);
    }
  }

  private createBot(botToken: string, apiRoot: string | undefined, mode: NetworkMode): Bot {
    const httpsAgent = new https.Agent({
      keepAlive: true,
      ...(mode === 'ipv4' ? { family: 4 } : {}),
    });

    return new Bot(botToken, {
      client: {
        ...(apiRoot ? { apiRoot } : {}),
        baseFetchConfig: {
          agent: httpsAgent,
        } as Record<string, unknown>,
      },
    });
  }

  private async verifyBotConnectivity(bot: Bot): Promise<void> {
    const me = await bot.api.getMe();
    this.pushLog(`[telegram] token ok for @${me.username}`);
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    this.pushLog('[telegram] webhook cleared');
  }

  public stop(): void {
    this.cleanupActiveTask();
    this.taskRunner.abortCurrentRun();

    if (!this.bot) {
      return;
    }

    this.bot.stop();
    this.bot = null;
    this.active = false;
    this.lastActivityAt = Date.now();
    this.currentPhase = 'idle';
    this.setStatus('Idle');
    this.pushLog('[telegram] stopped');
  }

  public stopCurrentTask(): void {
    if (!this.isProcessing) {
      return;
    }
    this.cleanupActiveTask();
    this.taskRunner.abortCurrentRun();
    this.isProcessing = false;
    this.currentPhase = 'idle';
    this.setStatus('Idle');
    this.pushLog('[telegram] current task stopped by UI');
  }

  private async executeTask(ctx: Context, task: string, images?: ImageContentExt[]): Promise<void> {
    if (this.isProcessing) {
      await ctx.reply('Agent is busy. Wait for completion or send /stop.');
      return;
    }

    const normalizedTask = task.trim();
    if (normalizedTask.length === 0) {
      return;
    }

    const settings = readTelecodeSettings();
    i18n.setLanguage(settings.agent.language === 'auto' ? 'ru' : settings.agent.language);
    const t = i18n.t;

    this.isProcessing = true;
    this.lastActivityAt = Date.now();
    this.currentChatId = typeof ctx.chat?.id === 'number' ? ctx.chat.id : null;
    this.setStatus('Running');
    let responseBuffer = '';
    const statusMessage = await ctx.reply(t.tg_studying_request);
    const startedAt = Date.now();

    const STATUS_THROTTLE_MS = 4_000;
    let lastEditTime = Date.now();
    let pendingFlush: NodeJS.Timeout | null = null;
    let pendingText = '';

    const flushStatus = async (): Promise<void> => {
      if (pendingFlush) {
        clearTimeout(pendingFlush);
        pendingFlush = null;
      }
      if (!ctx.chat?.id || !pendingText) {
        return;
      }
      try {
        await ctx.api.editMessageText(ctx.chat.id, statusMessage.message_id, limitText(pendingText));
        lastEditTime = Date.now();
        pendingText = '';
      } catch {
        // ignore rate errors
      }
    };

    const scheduleUpdate = (text: string): void => {
      pendingText = text;
      const gap = Date.now() - lastEditTime;
      if (gap >= STATUS_THROTTLE_MS) {
        void flushStatus();
      } else if (!pendingFlush) {
        pendingFlush = setTimeout(() => void flushStatus(), STATUS_THROTTLE_MS - gap);
      }
    };

    let unsubscribe: (() => void) | null = null;
    const toolStartedAt = new Map<string, number>();
    let phaseLabel = t.tg_phase_preparing;

    const setPhase = (nextPhase: string): void => {
      if (phaseLabel === nextPhase) {
        return;
      }
      phaseLabel = nextPhase;
      this.currentPhase = nextPhase;
      this.pushLog(`[phase] ${nextPhase}`);
      this.setStatus(`Running: ${nextPhase}`);
      scheduleUpdate(phaseLabel);
    };

    const sendTyping = async (): Promise<void> => {
      if (!ctx.chat?.id) {
        return;
      }
      try {
        await ctx.api.sendChatAction(ctx.chat.id, 'typing');
      } catch {
        // ignore
      }
    };

    void sendTyping();
    let typingInterval: NodeJS.Timeout | null = setInterval(() => {
      if (!this.isProcessing) {
        if (typingInterval) {
          clearInterval(typingInterval);
          typingInterval = null;
        }
        return;
      }
      void sendTyping();
    }, 4_500);

    const cleanupTask = () => {
      if (pendingFlush) {
        clearTimeout(pendingFlush);
        pendingFlush = null;
      }
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };
    this.activeTaskCleanup = cleanupTask;

    try {
      const runtime = this.ensureRuntime();
      responseBuffer = '';
      const preview = normalizedTask.length > 240 ? `${normalizedTask.slice(0, 240)}...` : normalizedTask;
      this.pushLog(`[request] engine=${runtime.engine} provider=${settings.agent.provider} model=${settings.agent.model}`);
      this.pushLog(`[request] prompt="${preview}"`);
      scheduleUpdate(`⏳ ${phaseLabel}\n\n${limitText(normalizedTask, 400)}`);

      unsubscribe = runtime.onEvent((event) => {
        if (event.type === 'text_delta') {
          responseBuffer += event.delta;
          setPhase('Writing response');
          this.setStatus('Thinking');
        }

        if (event.type === 'tool_start') {
          const phase = describeToolPhase(event.toolName, t);
          toolStartedAt.set(event.toolName, Date.now());
          const argsSummary = summarizeToolArgs(event.args);
          this.pushLog(`[tool:start] ${event.toolName}${argsSummary ? ` ${argsSummary}` : ''}`);
          setPhase(phase);
        }

        if (event.type === 'tool_end') {
          const startedAtTime = toolStartedAt.get(event.toolName);
          const durationMs = startedAtTime ? Date.now() - startedAtTime : null;
          const resultSummary = summarizeToolResult(event.result);
          const errorSummary = event.isError ? summarizeToolError(event.result) : '';
          this.pushLog(`[tool:end] ${event.toolName}${durationMs !== null ? ` ${durationMs}ms` : ''}${resultSummary ? ` ${resultSummary}` : ''}${errorSummary ? ` ${errorSummary}` : ''}`);
          if (event.isError) {
            setPhase(`Tool error: ${event.toolName}`);
          } else {
            setPhase('Reviewing tool result');
          }
        }

        if (event.type === 'status') {
          if (shouldLogTelegramStatus(event.message)) {
            this.pushLog(`[status] ${compactTelegramStatus(event.message)}`);
          }
          const nextPhase = describeRuntimePhase(event.message, t);
          if (nextPhase) {
            setPhase(nextPhase);
          }
        }

        if (event.type === 'error') {
          setPhase('Runtime error');
          this.pushLog(`[error] ${event.message}`);
        }

        if (event.type === 'done') {
          setPhase('Finalising response');
          this.setStatus('Idle');
          this.pushLog('[done]');
        }
      });

      scheduleUpdate(`⏳ ${phaseLabel}\n\n${limitText(normalizedTask, 400)}`);

      await this.taskRunner.runTask(normalizedTask, images);

      this.lastResponse = responseBuffer;
      this.isProcessing = false;
      this.setStatus('Idle');
      cleanupTask();

      await this.editMessageMarkdown(ctx, statusMessage.message_id, responseBuffer);
    } catch (error) {
      this.isProcessing = false;
      this.setStatus('Error');
      cleanupTask();
      const message = formatError(error);
      this.pushLog(`[execute:error] ${message}`);
      await ctx.reply(`Task failed: ${message}`);
    }
  }

  private ensureRuntime(): AgentRuntime {
    const settings = readTelecodeSettings();
    const currentTools = this.tools;
    
    const apiService = new TelegramApiService(this.bot, (l) => this.pushLog(l));
    const telegramTools = createTelegramTools(apiService, this.currentChatId, getWorkspaceRoot(), (l) => this.pushLog(l));
    const allTools = [...currentTools, ...telegramTools];

    const config: RuntimeConfig = {
      ...settings.agent,
      cwd: getWorkspaceRoot(),
      language: settings.agent.language === 'auto' ? undefined : settings.agent.language,
    };

    const signature = this.createRuntimeSignature(config, allTools);

    if (this.taskRunner.getRuntime && this.runtimeConfigSignature === signature) {
      return this.taskRunner.getRuntime;
    }

    this.pushLog(`[telegram] initializing matching runtime (engine=${settings.agent.provider})`);
    const runtime = this.taskRunner.initRuntime(config, allTools);
    this.runtimeConfigSignature = signature;
    return runtime;
  }

  private abortRuntime(): void {
    this.taskRunner.abortCurrentRun();
    this.runtimeConfigSignature = '';
  }

  private createRuntimeSignature(config: RuntimeConfig, tools: AgentTool[]): string {
    return JSON.stringify({
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl || '',
      maxSteps: config.maxSteps,
      apiKeySet: config.apiKey.length > 0,
      allowedTools: config.allowedTools,
      tools: tools.map((tool) => tool.name),
      language: config.language,
      responseStyle: config.responseStyle,
      promptSignature: getPromptStackSignature(config.cwd),
    });
  }

  private async replyMarkdown(ctx: Context, markdown: string): Promise<void> {
    const chunks = markdownToTelegramHtmlChunks(markdown);
    if (chunks.length === 0) {
      await ctx.reply('Done.');
      return;
    }

    try {
      for (const chunk of chunks) {
        await ctx.reply(chunk, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
      }
    } catch (error) {
      this.pushLog(`[format:warn] failed to send HTML, fallback to plain - ${formatError(error)}`);
      for (const chunk of splitPlainText(markdown)) {
        await ctx.reply(chunk, { link_preview_options: { is_disabled: true } });
      }
    }
  }

  private async editMessageMarkdown(ctx: Context, messageId: number, markdown: string): Promise<void> {
    if (!ctx.chat?.id) return;
    const chunks = markdownToTelegramHtmlChunks(markdown);
    if (chunks.length === 0) {
      await ctx.api.editMessageText(ctx.chat.id, messageId, 'Done.');
      return;
    }

    try {
      await ctx.api.editMessageText(ctx.chat.id, messageId, chunks[0], {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
      for (const extra of chunks.slice(1)) {
        await ctx.reply(extra, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      }
    } catch (error) {
      this.pushLog(`[format:warn] failed to edit HTML, fallback to plain - ${formatError(error)}`);
      const plain = splitPlainText(markdown);
      await ctx.api.editMessageText(ctx.chat.id, messageId, plain[0]);
      for (const extra of plain.slice(1)) {
        await ctx.reply(extra, { link_preview_options: { is_disabled: true } });
      }
    }
  }

  private async updateSetting(key: string, value: string | boolean): Promise<void> {
    await saveOpenSettingsFiles();
    const config = vscode.workspace.getConfiguration('telecode');
    await config.update(key, value, vscode.ConfigurationTarget.Global);
    this.abortRuntime();
  }

  private getT(): Translations {
    const settings = readTelecodeSettings();
    const lang = settings.agent.language === 'auto' ? 'ru' : settings.agent.language;
    i18n.setLanguage(lang);
    return i18n.t;
  }

  private renderStatus(t: Translations): string {
    const settings = readTelecodeSettings();
    const statusText = this.isProcessing 
      ? t.tg_status_running 
      : (this.currentPhase === 'Error' ? t.tg_status_error : t.tg_status_idle);

    return [
      `${t.tg_label_status}: ${statusText}`,
      `${t.tg_label_phase}: ${this.currentPhase}`,
      `${t.tg_label_provider}: ${settings.agent.provider}`,
      `${t.tg_label_model}: ${settings.agent.model}`,
      `${t.tg_label_style}: ${settings.agent.responseStyle}`,
      `${t.tg_label_language}: ${settings.agent.language}`,
    ].join('\n');
  }

  private renderSettings(t: Translations): string {
    const settings = readTelecodeSettings();
    return [
      `${t.tab_settings}:`,
      `- ${t.field_provider}: ${settings.agent.provider}`,
      `- ${t.field_model}: ${settings.agent.model}`,
      `- ${t.field_max_steps}: ${settings.agent.maxSteps}`,
      `- ${t.field_response_style}: ${settings.agent.responseStyle}`,
      `- ${t.field_language}: ${settings.agent.language}`,
      `- ${t.field_ui_language}: ${settings.agent.uiLanguage}`,
      `- Out of Workspace: ${settings.agent.allowOutOfWorkspace ? 'YES' : 'NO'}`,
    ].join('\n');
  }

  private pushLog(line: string): void {
    const entry = `[${new Date().toLocaleTimeString()}] ${line}`;
    this.logs.push(entry);
    if (this.logs.length > 300) this.logs.shift();
    if (this.onLog) this.onLog(entry);
  }

  private setStatus(status: string): void {
    this.currentPhase = status;
    if (this.onStatus) this.onStatus(status);
  }

  private renderHelp(t: Translations): string {
    return [
      t.tg_help_title,
      `/status - ${t.tg_cmd_status}`,
      `/settings - ${t.tg_cmd_settings}`,
      `/run <task> - ${t.tg_cmd_run}`,
      `/stop - ${t.tg_cmd_stop}`,
      `/last - ${t.tg_cmd_last}`,
      `/logs [N] - ${t.tg_cmd_logs}`,
      `/changes - ${t.tg_cmd_changes}`,
      `/diff <file> - ${t.tg_cmd_diff}`,
      `/rollback - ${t.tg_cmd_rollback}`,
      `/provider <id> - ${t.tg_cmd_provider}`,
      `/model <id> - ${t.tg_cmd_model}`,
      `/help - ${t.tg_cmd_help}`,
    ].join('\n');
  }

  private parseRawApiCommand(raw: string): { method: string; params: Record<string, unknown> } {
    const input = raw.trim();
    const firstSpace = input.indexOf(' ');
    if (firstSpace === -1) return { method: input, params: {} };
    const method = input.slice(0, firstSpace).trim();
    const rawJson = input.slice(firstSpace + 1).trim();
    try {
      const params = rawJson ? JSON.parse(rawJson) : {};
      return { method, params };
    } catch (e) {
      throw new Error(`Invalid JSON params: ${formatError(e)}`);
    }
  }

  private cleanupActiveTask(): void {
    if (this.activeTaskCleanup) {
      this.activeTaskCleanup();
      this.activeTaskCleanup = null;
    }
  }
}
