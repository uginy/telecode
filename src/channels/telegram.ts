import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
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

export class TelegramChannel {
  private bot: Bot | null = null;
  private runtime: AgentRuntime | null = null;
  private runtimeEngine: 'nanoclaw' | 'pi' | null = null;
  private isProcessing = false;

  private lastResponse = '';
  private readonly logs: string[] = [];

  constructor(private readonly tools: AgentTool[]) {}

  public async start(): Promise<void> {
    this.stop();

    const settings = readAISCodeSettings();
    const { enabled, botToken, chatId } = settings.telegram;

    if (!enabled || !botToken) {
      return;
    }

    try {
      this.bot = new Bot(botToken);
      const allowedChatId = parseTelegramChatId(chatId);
      if (chatId && allowedChatId === null) {
        const message = `AIS Code Telegram: invalid chatId "${chatId}". Use numeric id like 123456789 or -1001234567890.`;
        this.pushLog(`[error] ${message}`);
        vscode.window.showWarningMessage(message);
      }

      this.bot.use(async (ctx, next) => {
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
        console.error('AIS Code Telegram error:', error);
      });

      await this.bot.start({
        onStart: (botInfo) => {
          console.log(`AIS Code Telegram started as @${botInfo.username}`);
          vscode.window.showInformationMessage(`AIS Code: Telegram bot started (@${botInfo.username})`);
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isBenignPollingAbort(message)) {
        console.log('AIS Code Telegram: polling aborted during restart.');
        return;
      }
      vscode.window.showErrorMessage(`AIS Code: failed to start Telegram bot - ${message}`);
      console.error(error);
    }
  }

  public stop(): void {
    this.abortRuntime();

    if (!this.bot) {
      return;
    }

    this.bot.stop();
    this.bot = null;
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
    try {
      const runtime = this.ensureRuntime();
      responseBuffer = '';

      unsubscribe = runtime.onEvent((event) => {
        if (event.type === 'text_delta') {
          responseBuffer += event.delta;
        }

        if (event.type === 'tool_start') {
          this.pushLog(`[tool:start] ${event.toolName}`);
          void updateReply(`Running tool: ${event.toolName}`);
        }

        if (event.type === 'tool_end') {
          const suffix = event.isError ? 'error' : 'done';
          this.pushLog(`[tool:${suffix}] ${event.toolName}`);
        }

        if (event.type === 'status') {
          this.pushLog(`[status] ${event.message}`);
        }

        if (event.type === 'error') {
          this.pushLog(`[error] ${event.message}`);
        }

        if (event.type === 'done') {
          this.pushLog('[done]');
        }
      });

      await updateReply(`Running (${this.runtimeEngine || runtime.engine}): ${normalizedTask}`);

      await runtime.prompt(normalizedTask);

      this.lastResponse = responseBuffer.trim().length > 0 ? responseBuffer : 'Done.';
      await updateReply(this.lastResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.pushLog(`[error] ${message}`);
      await ctx.reply(limitText(`Agent failed: ${message}`));
      console.error(error);
    } finally {
      unsubscribe?.();
      this.isProcessing = false;
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
