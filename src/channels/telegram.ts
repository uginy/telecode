import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { Bot, InputFile, type Context } from 'grammy';
import { type AgentTool } from '@mariozechner/pi-agent-core';
import { Type, type Static } from '@mariozechner/pi-ai';
import MarkdownIt from 'markdown-it';
import { readAISCodeSettings } from '../config/settings';
import { createRuntime } from '../engine/createRuntime';
import type { AgentRuntime, RuntimeConfig } from '../engine/types';
import { getPromptStackSignature } from '../prompts/promptStack';

type EngineName = 'auto' | 'nanoclaw' | 'pi';

const TELEGRAM_TEXT_LIMIT = 3900;
const LOG_RING_LIMIT = 300;
const TELEGRAM_MAX_DOCUMENT_BYTES = 49 * 1024 * 1024;
type NetworkMode = 'auto' | 'ipv4';

const telegramSendFileParams = Type.Object({
  path: Type.String({ description: 'Absolute path or path relative to current workspace' }),
  archive: Type.Optional(Type.Boolean({ description: 'Zip file/folder before sending (default false)' })),
  archiveName: Type.Optional(Type.String({ description: 'Optional zip file name without path' })),
  caption: Type.Optional(Type.String({ description: 'Optional Telegram caption' })),
});

type TelegramSendFileParams = Static<typeof telegramSendFileParams>;

const telegramApiCallParams = Type.Object({
  method: Type.String({ description: 'Telegram Bot API method name, e.g. getChat or setMyCommands' }),
  params: Type.Optional(Type.Any({ description: 'Method params as JSON object. Use *Path fields for file uploads.' })),
});

type TelegramApiCallParams = Static<typeof telegramApiCallParams>;

type ParsedTelegramApiCommand = {
  method: string;
  params: Record<string, unknown>;
};

const TELEGRAM_MARKDOWN = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

export class TelegramChannel {
  private bot: Bot | null = null;
  private runtime: AgentRuntime | null = null;
  private runtimeConfigSignature = '';
  private runtimeEngine: 'nanoclaw' | 'pi' | null = null;
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
  ) {}

  public async start(): Promise<void> {
    this.stop();

    const settings = readAISCodeSettings();
    const { enabled, botToken, chatId, apiRoot, forceIPv4 } = settings.telegram;

    if (!enabled || !botToken) {
      this.pushLog('[telegram] disabled or missing bot token');
      this.setStatus('Idle');
      return;
    }

    try {
      const allowedChatId = parseTelegramChatId(chatId);
      if (chatId && allowedChatId === null) {
        const message = `AIS Code Telegram: invalid chatId "${chatId}". Use numeric id like 123456789 or -1001234567890.`;
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
          console.warn(`AIS Code Telegram: blocked chat id ${receivedChatId}`);
          try {
            await ctx.reply(
              `Access denied for chat ${receivedChatId}. Expected ${allowedChatId}. Update aisCode.telegram.chatId in settings.`
            );
          } catch {
            // ignore reply errors for blocked users
          }
          return;
        }
        await next();
      });

      this.bot.command('start', async (ctx) => {
        await ctx.reply('AIS Code bot is online. Use /help to see commands.');
      });

      this.bot.command('help', async (ctx) => {
        await ctx.reply(renderHelp());
      });

      this.bot.command('status', async (ctx) => {
        await ctx.reply(this.renderStatus());
      });

      this.bot.command('settings', async (ctx) => {
        await ctx.reply(this.renderSettings());
      });

      this.bot.command('stop', async (ctx) => {
        this.stopCurrentTask();
        await ctx.reply('Stopped current run.');
      });

      this.bot.command('last', async (ctx) => {
        if (!this.lastResponse) {
          await ctx.reply('No completed runs yet.');
          return;
        }
        await this.replyMarkdown(ctx, this.lastResponse);
      });

      this.bot.command('logs', async (ctx) => {
        const args = getCommandArgs(ctx);
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
        const args = getCommandArgs(ctx);
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
        const args = getCommandArgs(ctx);
        if (!args) {
          await ctx.reply('Usage: /api <method> [json params]\nExample: /api getChat {"chat_id":128529419}');
          return;
        }

        try {
          const parsed = parseTelegramApiCommand(args);
          const workspaceRoot = getWorkspaceRoot();
          const preparedParams = await this.prepareTelegramApiParams(parsed.params, workspaceRoot);
          const response = await this.callTelegramApi(parsed.method, preparedParams);
          const serialized = safeJsonStringify(response, 2);
          await this.replyMarkdown(ctx, `\`\`\`json\n${serialized}\n\`\`\``);
        } catch (error) {
          const message = formatError(error);
          this.pushLog(`[telegram:api:error] ${message}`);
          await ctx.reply(limitText(`API call failed: ${message}`));
        }
      });

      this.bot.command('engine', async (ctx) => {
        const args = getCommandArgs(ctx).toLowerCase();
        if (args !== 'auto' && args !== 'nanoclaw' && args !== 'pi') {
          await ctx.reply('Usage: /engine <auto|nanoclaw|pi>');
          return;
        }

        await this.updateSetting('engine', args as EngineName);
        await ctx.reply(`Engine updated to ${args}`);
      });

      this.bot.command('model', async (ctx) => {
        const args = getCommandArgs(ctx);
        if (!args) {
          await ctx.reply('Usage: /model <model-id>');
          return;
        }

        await this.updateSetting('model', args);
        await ctx.reply(`Model updated to ${args}`);
      });

      this.bot.command('provider', async (ctx) => {
        const args = getCommandArgs(ctx);
        if (!args) {
          await ctx.reply('Usage: /provider <provider-id>');
          return;
        }

        await this.updateSetting('provider', args);
        await ctx.reply(`Provider updated to ${args}`);
      });

      this.bot.command('run', async (ctx) => {
        const task = getCommandArgs(ctx);
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

      this.bot.catch((error) => {
        this.pushLog(`[telegram:error] ${formatError(error)}`);
        console.error('AIS Code Telegram error:', error);
      });

      await this.bot.start({
        onStart: (botInfo) => {
          this.lastActivityAt = Date.now();
          this.setStatus('Idle');
          this.pushLog(`[telegram] started as @${botInfo.username}`);
          console.log(`AIS Code Telegram started as @${botInfo.username}`);
          vscode.window.showInformationMessage(`AIS Code: Telegram bot started (@${botInfo.username})`);
          if (allowedChatId !== null) {
            void this.bot?.api
              .sendMessage(allowedChatId, 'AIS Code connected. Send /status')
              .catch((error) => this.pushLog(`[telegram:error] startup ping failed - ${formatError(error)}`));
          }
        },
      });
    } catch (error) {
      this.setStatus('Error');
      const message = formatError(error);
      if (isBenignPollingAbort(message)) {
        this.pushLog('[telegram] polling aborted during restart');
        console.log('AIS Code Telegram: polling aborted during restart.');
        return;
      }
      this.pushLog(`[telegram:error] failed to start - ${message}`);
      vscode.window.showErrorMessage(`AIS Code: failed to start Telegram bot - ${message}`);
      console.error(error);
    }
  }

  private createBot(botToken: string, apiRoot: string | undefined, mode: NetworkMode): Bot {
    const nativeFetch = (globalThis as { fetch?: typeof fetch }).fetch;
    if (typeof nativeFetch === 'function') {
      if (mode === 'ipv4') {
        this.pushLog('[telegram] using native fetch (forceIPv4 agent bypassed)');
      }
      return new Bot(botToken, {
        client: {
          ...(apiRoot ? { apiRoot } : {}),
          fetch: ((...args: any[]) => nativeFetch(...(args as [any, any?]))) as any,
        },
      });
    }

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
    this.abortRuntime();

    if (!this.bot) {
      return;
    }

    this.bot.stop();
    this.bot = null;
    this.lastActivityAt = Date.now();
    this.currentPhase = 'idle';
    this.setStatus('Idle');
    this.pushLog('[telegram] stopped');
    console.log('AIS Code Telegram stopped.');
  }

  public stopCurrentTask(): void {
    if (!this.isProcessing) {
      return;
    }
    this.cleanupActiveTask();
    this.abortRuntime();
    this.isProcessing = false;
    this.currentPhase = 'idle';
    this.setStatus('Idle');
    this.pushLog('[telegram] current task stopped by UI');
  }

  private async executeTask(ctx: Context, task: string): Promise<void> {
    if (this.isProcessing) {
      await ctx.reply('Agent is busy. Wait for completion or send /stop.');
      return;
    }

    const normalizedTask = task.trim();
    if (normalizedTask.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.lastActivityAt = Date.now();
    this.currentChatId = typeof ctx.chat?.id === 'number' ? ctx.chat.id : null;
    this.currentPhase = 'Обработка запроса';
    this.setStatus('Running');
    let responseBuffer = '';
    const statusMessage = await ctx.reply('Working on it...');
    const startedAt = Date.now();

    let lastEditTime = 0;
    const updateReply = async (text: string): Promise<void> => {
      const now = Date.now();
      if (now - lastEditTime < 1300) {
        return;
      }

      if (!ctx.chat?.id) {
        return;
      }

      try {
        await ctx.api.editMessageText(ctx.chat.id, statusMessage.message_id, limitText(text));
        lastEditTime = now;
      } catch {
        // ignore rate errors, final message still posted
      }
    };

    let unsubscribe: (() => void) | null = null;
    const toolStartedAt = new Map<string, number>();
    let lastEventAt = Date.now();
    let lastEventLabel = 'task_started';
    let phaseLabel = 'Обработка запроса';

    const formatProgress = (): string => {
      return phaseLabel;
    };

    const setPhase = (nextPhase: string): void => {
      if (phaseLabel === nextPhase) {
        return;
      }

      phaseLabel = nextPhase;
      this.currentPhase = nextPhase;
      this.pushLog(`[phase] ${nextPhase}`);
      this.setStatus(`Running: ${nextPhase}`);
      void updateReply(formatProgress());
    };

    const sendTyping = async (): Promise<void> => {
      if (!ctx.chat?.id) {
        return;
      }

      try {
        await ctx.api.sendChatAction(ctx.chat.id, 'typing');
      } catch {
        // ignore transient network/rate issues
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

    let heartbeat: NodeJS.Timeout | null = setInterval(() => {
      if (!this.isProcessing) {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        return;
      }
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const staleSec = Math.floor((Date.now() - lastEventAt) / 1000);
      this.pushLog(`[heartbeat] running ${elapsed}s • last_event=${lastEventLabel} (${staleSec}s ago)`);
      void updateReply(formatProgress());
      if (staleSec >= 180) {
        this.pushLog('[watchdog] no runtime events for 180s, aborting task');
        this.abortRuntime();
      }
    }, 12_000);
    const cleanup = () => {
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };
    this.activeTaskCleanup = cleanup;
    try {
      const runtime = this.ensureRuntime();
      responseBuffer = '';
      const settings = readAISCodeSettings();
      const preview = normalizedTask.length > 240 ? `${normalizedTask.slice(0, 240)}...` : normalizedTask;
      this.pushLog(
        `[request] engine=${runtime.engine} provider=${settings.agent.provider} model=${settings.agent.model} baseUrl=${settings.agent.baseUrl || '(default)'}`
      );
      const resolvedModel = runtime.getModelInfo?.();
      if (resolvedModel) {
        this.pushLog(
          `[request:model] api=${resolvedModel.api} provider=${resolvedModel.provider} model=${resolvedModel.id} baseUrl=${resolvedModel.baseUrl}`
        );
      }
      this.pushLog(`[request] prompt="${preview}"`);
      await updateReply(formatProgress());

      unsubscribe = runtime.onEvent((event) => {
        lastEventAt = Date.now();
        lastEventLabel = event.type === 'status' ? `status:${event.message}` : event.type;
        if (event.type === 'text_delta') {
          responseBuffer += event.delta;
          setPhase('Пишу ответ');
          this.setStatus('Thinking');
        }

        if (event.type === 'tool_start') {
          const phase = describeToolPhase(event.toolName);
          setPhase(phase);
          this.setStatus(`Tool ${event.toolName}`);
          toolStartedAt.set(event.toolName, Date.now());
          const argsSummary = summarizeToolArgs(event.args);
          this.pushLog(`[tool:start] ${event.toolName}${argsSummary ? ` ${argsSummary}` : ''}`);
          void updateReply(`${phase}\nTool: ${event.toolName}${argsSummary ? ` (${argsSummary})` : ''}`);
        }

        if (event.type === 'tool_end') {
          const suffix = event.isError ? 'error' : 'done';
          const startedAt = toolStartedAt.get(event.toolName);
          const durationMs = startedAt ? Date.now() - startedAt : null;
          const resultSummary = summarizeToolResult(event.result);
          const errorSummary = event.isError ? summarizeToolError(event.result) : '';
          this.pushLog(
            `[tool:${suffix}] ${event.toolName}${durationMs !== null ? ` ${durationMs}ms` : ''}${resultSummary ? ` ${resultSummary}` : ''}${errorSummary ? ` ${errorSummary}` : ''}`
          );
          if (!event.isError) {
            setPhase('Проверяю результат инструмента');
          }
        }

        if (event.type === 'status') {
          if (shouldLogTelegramStatus(event.message)) {
            this.pushLog(`[status] ${compactTelegramStatus(event.message)}`);
          }
          const nextPhase = describeRuntimePhase(event.message);
          if (nextPhase) {
            setPhase(nextPhase);
          }
        }

        if (event.type === 'error') {
          setPhase('Ошибка во время выполнения');
          this.pushLog(`[error] ${event.message}`);
        }

        if (event.type === 'done') {
          setPhase('Почти готово, отправляю ответ');
          this.setStatus('Idle');
          this.pushLog('[done]');
        }
      });

      await updateReply(
        `Запускаю (${this.runtimeEngine || runtime.engine})\n${formatProgress()}\n\n${limitText(normalizedTask, 300)}`
      );

      await runtime.prompt(normalizedTask);

      this.lastResponse = responseBuffer.trim().length > 0 ? responseBuffer : 'Done.';
      this.lastActivityAt = Date.now();
      await this.editMessageMarkdown(ctx, statusMessage.message_id, this.lastResponse);
    } catch (error) {
      this.setStatus('Error');
      this.currentPhase = 'Ошибка';
      const message = error instanceof Error ? error.message : String(error);
      this.pushLog(`[error] ${message}`);
      await ctx.reply(limitText(`Agent failed: ${message}`));
      console.error(error);
    } finally {
      cleanup();
      if (this.activeTaskCleanup === cleanup) {
        this.activeTaskCleanup = null;
      }
      this.isProcessing = false;
      this.currentChatId = null;
      this.currentPhase = 'idle';
      this.setStatus('Idle');
    }
  }

  private ensureRuntime(): AgentRuntime {
    const settings = readAISCodeSettings();
    const config: RuntimeConfig = {
      provider: settings.agent.provider,
      model: settings.agent.model,
      apiKey: settings.agent.apiKey,
      baseUrl: settings.agent.baseUrl,
      maxSteps: settings.agent.maxSteps,
      allowedTools: settings.agent.allowedTools,
      cwd: getWorkspaceRoot(),
    };

    const runtimeTools = [...this.tools, this.createTelegramSendFileTool(), this.createTelegramApiCallTool()];
    const signature = createRuntimeSignature(config, runtimeTools);
    if (this.runtime && this.runtimeConfigSignature === signature) {
      return this.runtime;
    }

    if (this.runtime && this.runtimeConfigSignature !== signature) {
      this.pushLog('[runtime] prompt/settings changed, recreating runtime');
      this.abortRuntime();
    }

    const created = createRuntime(settings.agent.engine, config, runtimeTools);
    this.runtime = created.runtime;
    this.runtimeConfigSignature = signature;
    this.runtimeEngine = created.engine;

    if (created.fallbackReason) {
      this.pushLog(`[runtime] ${created.fallbackReason}`);
    }

    return this.runtime;
  }

  private abortRuntime(): void {
    if (this.runtime) {
      this.runtime.abort();
    }

    this.runtime = null;
    this.runtimeConfigSignature = '';
    this.runtimeEngine = null;
  }

  private createTelegramSendFileTool(): AgentTool {
    return {
      name: 'telegram_send_file',
      label: 'TG Send File',
      description: 'Send file to current Telegram chat. Optionally zip file/folder before sending.',
      parameters: telegramSendFileParams,
      execute: async (_toolCallId, params) => {
        if (!this.bot) {
          throw new Error('Telegram bot is not running.');
        }

        if (this.currentChatId === null) {
          throw new Error('No active Telegram chat in current task context.');
        }

        const typed = params as TelegramSendFileParams;
        const workspaceRoot = getWorkspaceRoot();
        const resolved = await resolveExistingPath(typed.path, workspaceRoot);
        if (!resolved) {
          throw new Error(buildMissingPathError(typed.path, workspaceRoot));
        }

        const targetPath = resolved.path;
        const stat = resolved.stat;

        let uploadPath = targetPath;
        let tempDir: string | null = null;
        try {
          if (typed.archive === true) {
            const zipped = await this.createZipArchive(targetPath, typed.archiveName);
            uploadPath = zipped.archivePath;
            tempDir = zipped.tempDir;
          }

          const uploadStat = await fs.stat(uploadPath);
          const uploadBytes = toNumberBytes(uploadStat.size);
          if (uploadBytes > TELEGRAM_MAX_DOCUMENT_BYTES) {
            throw new Error(
              `File is too large for Telegram Bot API (${Math.ceil(uploadBytes / (1024 * 1024))}MB > ${Math.ceil(
                TELEGRAM_MAX_DOCUMENT_BYTES / (1024 * 1024)
              )}MB).`
            );
          }

          const fileName = path.basename(uploadPath);
          const caption = typed.caption?.trim();

          await this.bot.api.sendDocument(this.currentChatId, new InputFile(uploadPath, fileName), {
            ...(caption ? { caption: caption.slice(0, 1024) } : {}),
          });

          const targetKind = stat.isDirectory() ? 'directory' : 'file';
          const sentLabel = typed.archive === true ? `archive ${fileName}` : fileName;
          this.pushLog(`[telegram:file] sent ${sentLabel} from ${renderPath(uploadPath, workspaceRoot)}`);

          return {
            content: [
              {
                type: 'text',
                text: `Sent ${sentLabel} to Telegram chat ${this.currentChatId} (source ${targetKind}: ${renderPath(
                  targetPath,
                  workspaceRoot
                )}).`,
              },
            ],
            details: {
              path: renderPath(targetPath, workspaceRoot),
              uploadPath: renderPath(uploadPath, workspaceRoot),
              chatId: this.currentChatId,
              archived: typed.archive === true,
              bytes: uploadBytes,
            },
          };
        } finally {
          if (tempDir) {
            await fs.rm(tempDir, { recursive: true, force: true });
          }
        }
      },
    };
  }

  private createTelegramApiCallTool(): AgentTool {
    return {
      name: 'telegram_api_call',
      label: 'TG API Call',
      description:
        'Call any Telegram Bot API method. params may include local upload fields ending with Path, e.g. documentPath, photoPath, media[].mediaPath.',
      parameters: telegramApiCallParams,
      execute: async (_toolCallId, params) => {
        if (!this.bot) {
          throw new Error('Telegram bot is not running.');
        }

        const typed = params as TelegramApiCallParams;
        const method = typed.method.trim();
        if (!method) {
          throw new Error('method is required');
        }

        const workspaceRoot = getWorkspaceRoot();
        const preparedParams = await this.prepareTelegramApiParams(typed.params ?? {}, workspaceRoot);
        const response = await this.callTelegramApi(method, preparedParams);
        const responsePreview = safeJsonStringify(response, 2);
        this.pushLog(`[telegram:api] ${method} ok`);

        return {
          content: [
            {
              type: 'text',
              text: `Telegram API method ${method} executed successfully.\n${responsePreview}`,
            },
          ],
          details: {
            method,
            response,
          },
        };
      },
    };
  }

  private async prepareTelegramApiParams(value: unknown, workspaceRoot: string): Promise<unknown> {
    if (Array.isArray(value)) {
      const result: unknown[] = [];
      for (const item of value) {
        result.push(await this.prepareTelegramApiParams(item, workspaceRoot));
      }
      return result;
    }

    if (!isRecord(value)) {
      return value;
    }

    const prepared: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value)) {
      if (key.endsWith('Path') && typeof raw === 'string') {
        const targetKey = key.slice(0, -4);
        prepared[targetKey] = await this.toTelegramInputFile(raw, workspaceRoot);
        continue;
      }

      if (key.endsWith('Paths') && Array.isArray(raw)) {
        const targetKey = key.slice(0, -5);
        const files: InputFile[] = [];
        for (const item of raw) {
          if (typeof item !== 'string') {
            throw new Error(`${key} must contain only string paths`);
          }
          files.push(await this.toTelegramInputFile(item, workspaceRoot));
        }
        prepared[targetKey] = files;
        continue;
      }

      prepared[key] = await this.prepareTelegramApiParams(raw, workspaceRoot);
    }

    return prepared;
  }

  private async toTelegramInputFile(rawPath: string, workspaceRoot: string): Promise<InputFile> {
    const normalized = rawPath.trim();
    if (!normalized) {
      throw new Error('Upload path cannot be empty');
    }

    const resolved = await resolveExistingPath(normalized, workspaceRoot);
    if (!resolved) {
      throw new Error(buildMissingPathError(normalized, workspaceRoot));
    }
    const absolutePath = resolved.path;
    const stat = resolved.stat;
    if (!stat.isFile()) {
      throw new Error(`Upload path is not a file: ${absolutePath}`);
    }

    const sizeBytes = toNumberBytes(stat.size);
    if (sizeBytes > TELEGRAM_MAX_DOCUMENT_BYTES) {
      throw new Error(
        `File is too large for Telegram Bot API (${Math.ceil(sizeBytes / (1024 * 1024))}MB > ${Math.ceil(
          TELEGRAM_MAX_DOCUMENT_BYTES / (1024 * 1024)
        )}MB).`
      );
    }

    return new InputFile(absolutePath, path.basename(absolutePath));
  }

  private async callTelegramApi(method: string, params: unknown): Promise<unknown> {
    if (!this.bot) {
      throw new Error('Telegram bot is not running.');
    }

    const normalizedMethod = method.trim().replace(/^\/+/, '');
    if (!normalizedMethod) {
      throw new Error('Telegram API method is empty');
    }

    const payload = isRecord(params) ? params : {};
    const rawApi = this.bot.api.raw as Record<string, ((arg?: unknown) => Promise<unknown>) | undefined>;
    const methodFn = rawApi[normalizedMethod];
    if (typeof methodFn === 'function') {
      const result = Object.keys(payload).length > 0 ? await methodFn(payload) : await methodFn();
      this.pushLog(`[telegram:api] method=${normalizedMethod} mode=grammy`);
      return result;
    }

    if (containsInputFile(payload)) {
      throw new Error(
        `Method ${normalizedMethod} is not in current grammY raw API and payload contains file uploads. ` +
          'Update grammY or use a supported method for multipart upload.'
      );
    }

    const httpResult = await this.callTelegramApiOverHttp(normalizedMethod, payload);
    this.pushLog(`[telegram:api] method=${normalizedMethod} mode=http`);
    return httpResult;
  }

  private async callTelegramApiOverHttp(method: string, payload: Record<string, unknown>): Promise<unknown> {
    const settings = readAISCodeSettings();
    const token = settings.telegram.botToken.trim();
    if (!token) {
      throw new Error('telegram.botToken is empty');
    }

    const apiRoot = (settings.telegram.apiRoot || 'https://api.telegram.org').trim().replace(/\/+$/, '');
    const url = `${apiRoot}/bot${token}/${method}`;

    const nativeFetch = (globalThis as { fetch?: typeof fetch }).fetch;
    if (typeof nativeFetch !== 'function') {
      throw new Error('Fetch is not available in current runtime for HTTP fallback');
    }

    const response = await nativeFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Telegram HTTP fallback returned non-JSON response (${response.status})`);
    }

    if (!isRecord(body)) {
      throw new Error(`Telegram HTTP fallback returned unexpected payload (${response.status})`);
    }

    const ok = body.ok;
    if (ok !== true) {
      const description = typeof body.description === 'string' ? body.description : 'unknown Telegram API error';
      const code = typeof body.error_code === 'number' ? body.error_code : response.status;
      throw new Error(`Telegram API ${method} failed (${code}): ${description}`);
    }

    return body.result;
  }

  private async createZipArchive(targetPath: string, archiveName?: string): Promise<{ archivePath: string; tempDir: string }> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ais-code-tg-'));
    const sourceName = path.basename(targetPath);
    const normalizedName = (archiveName || sourceName || 'artifact').trim().replace(/[\\/]/g, '_');
    const fileName = normalizedName.toLowerCase().endsWith('.zip') ? normalizedName : `${normalizedName}.zip`;
    const archivePath = path.join(tempDir, fileName);
    const sourceDir = path.dirname(targetPath);

    try {
      await runCommand('zip', ['-r', '-q', archivePath, sourceName], sourceDir, 120_000);
    } catch (zipError) {
      try {
        await runCommand('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', targetPath, archivePath], sourceDir, 120_000);
      } catch (dittoError) {
        const zipMessage = formatError(zipError);
        const dittoMessage = formatError(dittoError);
        throw new Error(`Failed to create zip archive. zip: ${zipMessage}; ditto: ${dittoMessage}`);
      }
    }

    return { archivePath, tempDir };
  }

  private cleanupActiveTask(): void {
    if (!this.activeTaskCleanup) {
      return;
    }
    this.activeTaskCleanup();
    this.activeTaskCleanup = null;
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
      this.pushLog(`[format:warn] failed to send HTML, falling back to plain text - ${formatError(error)}`);
      for (const chunk of splitPlainText(markdown)) {
        await ctx.reply(chunk, {
          link_preview_options: { is_disabled: true },
        });
      }
    }
  }

  private async editMessageMarkdown(ctx: Context, messageId: number, markdown: string): Promise<void> {
    if (!ctx.chat?.id) {
      return;
    }

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
        await ctx.reply(extra, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
      }
    } catch (error) {
      this.pushLog(`[format:warn] failed to edit HTML, falling back to plain text - ${formatError(error)}`);
      const plainChunks = splitPlainText(markdown);
      await ctx.api.editMessageText(ctx.chat.id, messageId, plainChunks[0]);
      for (const extra of plainChunks.slice(1)) {
        await ctx.reply(extra, {
          link_preview_options: { is_disabled: true },
        });
      }
    }
  }

  private async updateSetting(key: string, value: string | boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration('aisCode');
    await config.update(key, value, vscode.ConfigurationTarget.Global);

    this.abortRuntime();
    this.pushLog(`[settings] ${key} updated`);
  }

  private renderStatus(): string {
    const settings = readAISCodeSettings();
    const connectionState = this.bot ? (this.isProcessing ? 'running' : 'connected') : 'disconnected';
    const executionState = this.isProcessing ? 'running' : this.runtime ? 'ready' : 'idle';
    const lastActivity = this.lastActivityAt > 0 ? new Date(this.lastActivityAt).toLocaleString() : 'n/a';
    return [
      `status: ${executionState}`,
      `connection: ${connectionState}`,
      `engine: ${settings.agent.engine}${this.runtimeEngine ? ` (active: ${this.runtimeEngine})` : ''}`,
      `provider: ${settings.agent.provider}`,
      `model: ${settings.agent.model}`,
      `workspace: ${getWorkspaceRoot()}`,
      `telegram: ${settings.telegram.enabled ? 'enabled' : 'disabled'}`,
      `last_activity: ${lastActivity}`,
      `phase: ${this.currentPhase}`,
    ].join('\n');
  }

  private renderSettings(): string {
    const settings = readAISCodeSettings();

    return [
      `engine: ${settings.agent.engine}`,
      `provider: ${settings.agent.provider}`,
      `model: ${settings.agent.model}`,
      `baseUrl: ${settings.agent.baseUrl || '(none)'}`,
      `maxSteps: ${settings.agent.maxSteps}`,
      `telegram.enabled: ${settings.telegram.enabled}`,
      `telegram.chatId: ${settings.telegram.chatId || '(none)'}`,
      `telegram.botToken: ${maskToken(settings.telegram.botToken)}`,
    ].join('\n');
  }

  private pushLog(line: string): void {
    this.logs.push(line);
    if (this.logs.length > LOG_RING_LIMIT) {
      this.logs.splice(0, this.logs.length - LOG_RING_LIMIT);
    }
    this.onLog?.(line);
  }

  private setStatus(status: string): void {
    this.onStatus?.(`Telegram: ${status}`);
  }
}

function renderHelp(): string {
  return [
    'AIS Code Telegram commands:',
    '/status - runtime and model status',
    '/settings - current config snapshot',
    '/run <task> - run task',
    '/stop - stop active run',
    '/last - show last answer',
    '/logs [N] - recent logs (default 20)',
    '/changes - git working tree summary',
    '/diff <file> - git diff for file',
    '/rollback - restore changed files to HEAD',
    '/api <method> [json] - call raw Telegram Bot API method',
    '/engine <auto|nanoclaw|pi> - switch runtime',
    '/provider <id> - switch provider',
    '/model <id> - switch model',
    '/help - this message',
  ].join('\n');
}

function getCommandArgs(ctx: Context): string {
  const match = ctx.match;
  if (typeof match === 'string') {
    return match.trim();
  }
  return '';
}

function limitText(text: string, limit = TELEGRAM_TEXT_LIMIT): string {
  return text.length > limit ? `${text.slice(0, limit)}\n...trimmed...` : text;
}

function splitPlainText(text: string, limit = TELEGRAM_TEXT_LIMIT): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const remaining = normalized.length - cursor;
    if (remaining <= limit) {
      chunks.push(normalized.slice(cursor));
      break;
    }

    let cut = normalized.lastIndexOf('\n', cursor + limit);
    if (cut <= cursor) {
      cut = normalized.lastIndexOf(' ', cursor + limit);
    }
    if (cut <= cursor) {
      cut = cursor + limit;
    }

    chunks.push(normalized.slice(cursor, cut).trimEnd());
    cursor = cut;
    while (cursor < normalized.length && /\s/.test(normalized[cursor])) {
      cursor += 1;
    }
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

function describeRuntimePhase(message: string): string | null {
  const normalized = message.trim().toLowerCase();

  if (normalized.startsWith('llm_config')) {
    return 'Подключаю модель и готовлю запрос';
  }
  if (normalized.startsWith('agent_start')) {
    return 'Запускаю агента';
  }
  if (normalized.startsWith('turn_start')) {
    return 'Анализирую задачу';
  }
  if (normalized.startsWith('message_start')) {
    return 'Планирую решение';
  }
  if (normalized.startsWith('message_end')) {
    return 'Проверяю промежуточный результат';
  }
  if (normalized.startsWith('tool_execution_update:')) {
    return 'Использую инструмент';
  }
  if (normalized.startsWith('turn_end')) {
    return 'Собираю итог ответа';
  }
  if (normalized.startsWith('agent_end')) {
    return 'Почти готово, отправляю результат';
  }

  return null;
}

function describeToolPhase(toolName: string): string {
  const normalized = toolName.trim().toLowerCase();

  if (
    normalized.includes('read') ||
    normalized.includes('glob') ||
    normalized.includes('grep') ||
    normalized.includes('search')
  ) {
    return 'Поиск и анализ кода';
  }

  if (
    normalized.includes('edit') ||
    normalized.includes('write') ||
    normalized.includes('patch') ||
    normalized.includes('replace')
  ) {
    return 'Фикшу баг и вношу правки';
  }

  if (
    normalized.includes('bash') ||
    normalized.includes('terminal') ||
    normalized.includes('command') ||
    normalized.includes('exec')
  ) {
    return 'Запускаю команды и проверяю проект';
  }

  if (normalized.includes('test') || normalized.includes('lint')) {
    return 'Проверяю качество: тесты и линт';
  }

  if (normalized.includes('git') || normalized.includes('diff')) {
    return 'Проверяю изменения в git';
  }

  return `Использую tool: ${toolName}`;
}

type MarkdownToken = ReturnType<typeof TELEGRAM_MARKDOWN.parse>[number];

type MarkdownRenderState = {
  listStack: Array<{ ordered: boolean; nextIndex: number }>;
  linkStack: boolean[];
};

function markdownToTelegramHtmlChunks(markdownText: string, limit = TELEGRAM_TEXT_LIMIT): string[] {
  const normalized = markdownText.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  const sections = normalized.split(/\n{2,}/).map((section) => section.trim()).filter((section) => section.length > 0);
  let current = '';

  const flushCurrent = (): void => {
    const value = current.trim();
    if (!value) {
      current = '';
      return;
    }

    const html = markdownToTelegramHtml(value);
    chunks.push(html);
    current = '';
  };

  for (const section of sections) {
    const candidate = current ? `${current}\n\n${section}` : section;
    const candidateHtml = markdownToTelegramHtml(candidate);

    if (candidateHtml.length <= limit) {
      current = candidate;
      continue;
    }

    if (current) {
      flushCurrent();
    }

    const sectionHtml = markdownToTelegramHtml(section);
    if (sectionHtml.length <= limit) {
      current = section;
      continue;
    }

    for (const plainChunk of splitPlainText(section, Math.max(800, limit - 200))) {
      const htmlChunk = markdownToTelegramHtml(plainChunk);
      chunks.push(htmlChunk);
    }
  }

  if (current) {
    flushCurrent();
  }

  if (chunks.length === 0) {
    const fallback = markdownToTelegramHtml(normalized);
    if (fallback.length <= limit) {
      return [fallback];
    }

    return splitPlainText(normalized, Math.max(800, limit - 200)).map((chunk) => markdownToTelegramHtml(chunk));
  }

  const boundedChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= limit) {
      boundedChunks.push(chunk);
      continue;
    }

    const plain = chunk.replace(/<[^>]*>/g, '');
    for (const plainChunk of splitPlainText(plain, limit - 40)) {
      boundedChunks.push(escapeTelegramHtml(plainChunk));
    }
  }

  return boundedChunks;
}

function markdownToTelegramHtml(markdownText: string): string {
  const tokens = TELEGRAM_MARKDOWN.parse(markdownText, {});
  const state: MarkdownRenderState = {
    listStack: [],
    linkStack: [],
  };

  const html = renderMarkdownTokens(tokens, state)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return html.length > 0 ? html : 'Done.';
}

function renderMarkdownTokens(tokens: MarkdownToken[], state: MarkdownRenderState): string {
  let out = '';

  for (const token of tokens) {
    switch (token.type) {
      case 'inline':
        if (Array.isArray(token.children)) {
          out += renderMarkdownTokens(token.children as MarkdownToken[], state);
        }
        break;
      case 'text':
        out += escapeTelegramHtml(token.content || '');
        break;
      case 'softbreak':
      case 'hardbreak':
        out += '\n';
        break;
      case 'paragraph_open':
        break;
      case 'paragraph_close':
        out += '\n\n';
        break;
      case 'heading_open':
        out += '<b>';
        break;
      case 'heading_close':
        out += '</b>\n';
        break;
      case 'strong_open':
        out += '<b>';
        break;
      case 'strong_close':
        out += '</b>';
        break;
      case 'em_open':
        out += '<i>';
        break;
      case 'em_close':
        out += '</i>';
        break;
      case 's_open':
        out += '<s>';
        break;
      case 's_close':
        out += '</s>';
        break;
      case 'blockquote_open':
        out += '<blockquote>';
        break;
      case 'blockquote_close':
        out += '</blockquote>\n';
        break;
      case 'bullet_list_open':
        state.listStack.push({ ordered: false, nextIndex: 1 });
        break;
      case 'bullet_list_close':
        state.listStack.pop();
        out += '\n';
        break;
      case 'ordered_list_open': {
        const startValue = Number.parseInt(getTokenAttr(token, 'start') || '1', 10);
        const nextIndex = Number.isFinite(startValue) && startValue > 0 ? startValue : 1;
        state.listStack.push({ ordered: true, nextIndex });
        break;
      }
      case 'ordered_list_close':
        state.listStack.pop();
        out += '\n';
        break;
      case 'list_item_open': {
        const currentList = state.listStack[state.listStack.length - 1];
        const depth = Math.max(0, state.listStack.length - 1);
        const prefix = '  '.repeat(depth);
        if (currentList?.ordered) {
          out += `${prefix}${currentList.nextIndex}. `;
          currentList.nextIndex += 1;
        } else {
          out += `${prefix}- `;
        }
        break;
      }
      case 'list_item_close':
        out += '\n';
        break;
      case 'fence':
      case 'code_block': {
        const content = (token.content || '').replace(/\n+$/g, '');
        out += `<pre>${escapeTelegramHtml(content.length > 0 ? content : ' ')}</pre>\n`;
        break;
      }
      case 'code_inline':
        out += `<code>${escapeTelegramHtml(token.content || '')}</code>`;
        break;
      case 'link_open': {
        const href = getTokenAttr(token, 'href');
        if (href && isSupportedTelegramUrl(href)) {
          out += `<a href="${escapeTelegramHtmlAttribute(href)}">`;
          state.linkStack.push(true);
        } else {
          state.linkStack.push(false);
        }
        break;
      }
      case 'link_close': {
        const opened = state.linkStack.pop();
        if (opened) {
          out += '</a>';
        }
        break;
      }
      case 'hr':
        out += '--------\n';
        break;
      default:
        break;
    }
  }

  return out;
}

function getTokenAttr(token: MarkdownToken, name: string): string | null {
  if (typeof token.attrGet === 'function') {
    return token.attrGet(name);
  }

  if (!Array.isArray(token.attrs)) {
    return null;
  }

  for (const attr of token.attrs) {
    if (Array.isArray(attr) && attr[0] === name) {
      return typeof attr[1] === 'string' ? attr[1] : null;
    }
  }

  return null;
}

function isSupportedTelegramUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();
    return protocol === 'http:' || protocol === 'https:' || protocol === 'tg:' || protocol === 'mailto:';
  } catch {
    return false;
  }
}

function escapeTelegramHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeTelegramHtmlAttribute(value: string): string {
  return escapeTelegramHtml(value).replace(/"/g, '&quot;');
}

function maskToken(token: string): string {
  if (!token) {
    return '(empty)';
  }

  if (token.length <= 8) {
    return '********';
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function getWorkspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? folder.uri.fsPath : process.cwd();
}

function renderPath(targetPath: string, workspaceRoot: string): string {
  const relative = path.relative(workspaceRoot, targetPath);
  if (!relative || relative === '.') {
    return '.';
  }
  if (relative.startsWith('..')) {
    return targetPath;
  }
  return relative;
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${command} ${args.join(' ')} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      if (exitCode !== 0) {
        const message = stderr.trim().length > 0 ? stderr.trim() : `${command} exited with code ${exitCode}`;
        reject(new Error(message));
        return;
      }

      resolve({ stdout, stderr, exitCode });
    });
  });
}

async function runGitCommand(args: string[], timeoutMs = 30_000): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const cwd = getWorkspaceRoot();

  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, env: process.env });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`git ${args.join(' ')} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (exitCode) => {
      clearTimeout(timeout);

      if (exitCode !== 0 && stderr.trim().length > 0) {
        reject(new Error(stderr.trim()));
        return;
      }

      resolve({ stdout, stderr, exitCode });
    });
  });
}

async function rollbackWorkingTree(): Promise<string> {
  const root = getWorkspaceRoot();
  const { stdout } = await runGitCommand(['status', '--porcelain']);
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);

  if (lines.length === 0) {
    return 'No changes to rollback.';
  }

  const trackedFiles: string[] = [];
  const untrackedFiles: string[] = [];

  for (const line of lines) {
    const status = line.slice(0, 2);
    const file = line.slice(3).trim();

    if (!file) {
      continue;
    }

    if (status === '??') {
      untrackedFiles.push(file);
    } else {
      trackedFiles.push(file);
    }
  }

  if (trackedFiles.length > 0) {
    await runGitCommand(['restore', '--staged', '--worktree', '--', ...trackedFiles]);
  }

  for (const relativeFile of untrackedFiles) {
    const absolute = path.resolve(root, relativeFile);
    await fs.rm(absolute, { force: true, recursive: true });
  }

  return `Rollback complete. restored=${trackedFiles.length}, removed_untracked=${untrackedFiles.length}`;
}

function isBenignPollingAbort(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized.includes('aborted delay') || normalized.includes('long polling aborted');
}

function summarizeToolArgs(args: unknown): string {
  if (!args || typeof args !== 'object') {
    return '';
  }

  const record = args as Record<string, unknown>;
  const parts: string[] = [];
  pushSummary(parts, 'path', record.path);
  pushSummary(parts, 'cwd', record.cwd);
  pushSummary(parts, 'query', record.query);
  pushSummary(parts, 'pattern', record.pattern);
  pushSummary(parts, 'glob', record.glob);
  pushSummary(parts, 'command', record.command);
  pushSummary(parts, 'startLine', record.startLine);
  pushSummary(parts, 'endLine', record.endLine);
  pushSummary(parts, 'maxResults', record.maxResults);
  return parts.join(' ');
}

function summarizeToolResult(result: unknown): string {
  if (!result || typeof result !== 'object') {
    return '';
  }

  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== 'object') {
    return '';
  }

  const record = details as Record<string, unknown>;
  const parts: string[] = [];
  pushSummary(parts, 'path', record.path);
  pushSummary(parts, 'cwd', record.cwd);
  pushSummary(parts, 'count', record.count);
  pushSummary(parts, 'replacements', record.replacements);
  pushSummary(parts, 'bytes', record.bytes);
  return parts.join(' ');
}

function summarizeToolError(result: unknown): string {
  if (!result || typeof result !== 'object') {
    return '';
  }

  const maybeMessage =
    (result as { message?: unknown }).message ||
    (result as { error?: unknown }).error ||
    (result as { details?: { error?: unknown } }).details?.error;

  if (typeof maybeMessage !== 'string') {
    return '';
  }

  const compact = maybeMessage.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '';
  }

  return `error=${compact.length > 120 ? `${compact.slice(0, 117)}...` : compact}`;
}

function pushSummary(parts: string[], key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }

  const text = String(value).replace(/\s+/g, ' ').trim();
  if (text.length === 0) {
    return;
  }

  const compact = text.length > 70 ? `${text.slice(0, 67)}...` : text;
  parts.push(`${key}=${compact}`);
}

function formatError(error: unknown): string {
  const httpInner = extractHttpInnerDetail(error);
  if (httpInner) {
    return httpInner;
  }

  if (error instanceof Error) {
    const detail = extractCauseDetail((error as { cause?: unknown }).cause);
    return detail ? `${error.message} (cause: ${detail})` : error.message;
  }
  return String(error);
}

function extractHttpInnerDetail(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const record = error as Record<string, unknown>;
  const message = typeof record.message === 'string' ? record.message : String(error);
  const inner = record.error;
  const innerDetail = extractCauseDetail(inner);
  if (!innerDetail) {
    return null;
  }

  return `${message} (inner: ${innerDetail})`;
}

function extractCauseDetail(cause: unknown): string | null {
  if (!cause || typeof cause !== 'object') {
    return null;
  }

  const record = cause as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name : '';
  const code =
    typeof record.code === 'string' ? record.code : typeof record.code === 'number' ? String(record.code) : '';
  const errno =
    typeof record.errno === 'string' ? record.errno : typeof record.errno === 'number' ? String(record.errno) : '';
  const type = typeof record.type === 'string' ? record.type : '';
  const message = typeof record.message === 'string' ? record.message : '';
  const detail = [name, type, code, errno, message].filter((part) => part.length > 0).join(' ');
  return detail.length > 0 ? detail : null;
}

function isLikelyNetworkError(error: unknown): boolean {
  if (error instanceof Error && error.message.toLowerCase().includes('network request')) {
    return true;
  }

  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as Record<string, unknown>;
  const inner = record.error;
  if (!inner || typeof inner !== 'object') {
    return false;
  }

  const innerRecord = inner as Record<string, unknown>;
  const code = typeof innerRecord.code === 'string' ? innerRecord.code : '';
  if (!code) {
    return false;
  }

  return (
    code.startsWith('EAI_') ||
    code === 'ENOTFOUND' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'EHOSTUNREACH' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
  );
}

function shouldLogTelegramStatus(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized.startsWith('event:')) {
    return false;
  }

  return true;
}

function compactTelegramStatus(message: string): string {
  if (!message.startsWith('prompt_stack_missing ')) {
    return message;
  }

  const raw = message.replace('prompt_stack_missing ', '').trim();
  if (!raw) {
    return 'prompt_stack_missing';
  }

  const items = raw.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
  if (items.length <= 4) {
    return `prompt_stack_missing ${items.join(',')}`;
  }

  return `prompt_stack_missing ${items.slice(0, 3).join(',')} (+${items.length - 3} more)`;
}

function parseTelegramChatId(raw?: string): number | null {
  const value = (raw || '').trim();
  if (value.length === 0) {
    return null;
  }

  if (!/^-?\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return null;
  }

  return parsed;
}

type ExistingPathResolution = {
  path: string;
  stat: Awaited<ReturnType<typeof fs.stat>>;
};

function getWorkspaceRoots(): string[] {
  const folders = vscode.workspace.workspaceFolders || [];
  const roots = folders.map((folder) => folder.uri.fsPath).filter((value) => value.length > 0);
  if (roots.length > 0) {
    return roots;
  }
  return [process.cwd()];
}

function getCandidatePaths(rawPath: string, primaryRoot: string): string[] {
  const normalized = rawPath.trim();
  if (!normalized) {
    return [];
  }

  if (path.isAbsolute(normalized)) {
    return [path.normalize(normalized)];
  }

  const roots = [primaryRoot, ...getWorkspaceRoots(), process.cwd()];
  const uniqueRoots = [...new Set(roots)];
  return uniqueRoots.map((root) => path.resolve(root, normalized));
}

async function resolveExistingPath(rawPath: string, primaryRoot: string): Promise<ExistingPathResolution | null> {
  const candidates = getCandidatePaths(rawPath, primaryRoot);
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      return { path: candidate, stat };
    } catch {
      // try next candidate
    }
  }

  return null;
}

function buildMissingPathError(rawPath: string, primaryRoot: string): string {
  const candidates = getCandidatePaths(rawPath, primaryRoot);
  const preview = candidates.slice(0, 4).join(', ');
  const suffix = candidates.length > 4 ? ` (+${candidates.length - 4} more)` : '';
  return `Path not found: ${rawPath}. Tried: ${preview}${suffix}`;
}

function toNumberBytes(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

function createRuntimeSignature(config: RuntimeConfig, tools: AgentTool[]): string {
  return JSON.stringify({
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl || '',
    maxSteps: config.maxSteps,
    apiKeySet: config.apiKey.length > 0,
    allowedTools: config.allowedTools,
    tools: tools.map((tool) => tool.name),
    promptSignature: getPromptStackSignature(config.cwd),
  });
}

function parseTelegramApiCommand(raw: string): ParsedTelegramApiCommand {
  const input = raw.trim();
  const firstSpace = input.indexOf(' ');
  if (firstSpace === -1) {
    return { method: input, params: {} };
  }

  const method = input.slice(0, firstSpace).trim();
  const rawJson = input.slice(firstSpace + 1).trim();
  if (!method) {
    throw new Error('Method is required');
  }
  if (!rawJson) {
    return { method, params: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new Error(`Invalid JSON params: ${formatError(error)}`);
  }

  if (!isRecord(parsed)) {
    throw new Error('JSON params must be an object');
  }

  return { method, params: parsed };
}

function safeJsonStringify(value: unknown, indent = 0): string {
  try {
    return JSON.stringify(value, null, indent);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function containsInputFile(value: unknown): boolean {
  if (value instanceof InputFile) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((entry) => containsInputFile(entry));
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).some((entry) => containsInputFile(entry));
}
