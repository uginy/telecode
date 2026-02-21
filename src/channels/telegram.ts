import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as https from 'node:https';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { Bot, type Context } from 'grammy';
import { type AgentTool } from '@mariozechner/pi-agent-core';
import { readAISCodeSettings } from '../config/settings';
import { createRuntime } from '../engine/createRuntime';
import type { AgentRuntime, RuntimeConfig } from '../engine/types';

type EngineName = 'auto' | 'nanoclaw' | 'pi';

const TELEGRAM_TEXT_LIMIT = 3900;
const LOG_RING_LIMIT = 300;
type NetworkMode = 'auto' | 'ipv4';

export class TelegramChannel {
  private bot: Bot | null = null;
  private runtime: AgentRuntime | null = null;
  private runtimeEngine: 'nanoclaw' | 'pi' | null = null;
  private isProcessing = false;

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
        this.abortRuntime();
        this.isProcessing = false;
        await ctx.reply('Stopped current run.');
      });

      this.bot.command('last', async (ctx) => {
        if (!this.lastResponse) {
          await ctx.reply('No completed runs yet.');
          return;
        }
        await ctx.reply(limitText(this.lastResponse));
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
    this.abortRuntime();

    if (!this.bot) {
      return;
    }

    this.bot.stop();
    this.bot = null;
    this.setStatus('Idle');
    this.pushLog('[telegram] stopped');
    console.log('AIS Code Telegram stopped.');
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
    this.setStatus('Running');
    let responseBuffer = '';
    const statusMessage = await ctx.reply('Working on it...');

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
    try {
      const runtime = this.ensureRuntime();
      responseBuffer = '';

      unsubscribe = runtime.onEvent((event) => {
        if (event.type === 'text_delta') {
          responseBuffer += event.delta;
          this.setStatus('Thinking');
        }

        if (event.type === 'tool_start') {
          this.setStatus(`Tool ${event.toolName}`);
          toolStartedAt.set(event.toolName, Date.now());
          const argsSummary = summarizeToolArgs(event.args);
          this.pushLog(`[tool:start] ${event.toolName}${argsSummary ? ` ${argsSummary}` : ''}`);
          void updateReply(`Running tool: ${event.toolName}${argsSummary ? ` (${argsSummary})` : ''}`);
        }

        if (event.type === 'tool_end') {
          const suffix = event.isError ? 'error' : 'done';
          const startedAt = toolStartedAt.get(event.toolName);
          const durationMs = startedAt ? Date.now() - startedAt : null;
          const resultSummary = summarizeToolResult(event.result);
          this.pushLog(
            `[tool:${suffix}] ${event.toolName}${durationMs !== null ? ` ${durationMs}ms` : ''}${resultSummary ? ` ${resultSummary}` : ''}`
          );
        }

        if (event.type === 'status') {
          this.pushLog(`[status] ${event.message}`);
        }

        if (event.type === 'error') {
          this.pushLog(`[error] ${event.message}`);
        }

        if (event.type === 'done') {
          this.setStatus('Idle');
          this.pushLog('[done]');
        }
      });

      await updateReply(`Running (${this.runtimeEngine || runtime.engine}): ${normalizedTask}`);

      await runtime.prompt(normalizedTask);

      this.lastResponse = responseBuffer.trim().length > 0 ? responseBuffer : 'Done.';
      await updateReply(this.lastResponse);
    } catch (error) {
      this.setStatus('Error');
      const message = error instanceof Error ? error.message : String(error);
      this.pushLog(`[error] ${message}`);
      await ctx.reply(limitText(`Agent failed: ${message}`));
      console.error(error);
    } finally {
      unsubscribe?.();
      this.isProcessing = false;
      this.setStatus('Idle');
    }
  }

  private ensureRuntime(): AgentRuntime {
    if (this.runtime) {
      return this.runtime;
    }

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

    const created = createRuntime(settings.agent.engine, config, this.tools);
    this.runtime = created.runtime;
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
    this.runtimeEngine = null;
  }

  private async updateSetting(key: string, value: string | boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration('aisCode');
    await config.update(key, value, vscode.ConfigurationTarget.Global);

    this.abortRuntime();
    this.pushLog(`[settings] ${key} updated`);
  }

  private renderStatus(): string {
    const settings = readAISCodeSettings();
    return [
      `status: ${this.isProcessing ? 'running' : 'idle'}`,
      `engine: ${settings.agent.engine}${this.runtimeEngine ? ` (active: ${this.runtimeEngine})` : ''}`,
      `provider: ${settings.agent.provider}`,
      `model: ${settings.agent.model}`,
      `workspace: ${getWorkspaceRoot()}`,
      `telegram: ${settings.telegram.enabled ? 'enabled' : 'disabled'}`,
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
