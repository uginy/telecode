import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { i18n, type Translations } from '../../services/i18n';

export const TELEGRAM_TEXT_LIMIT = 3900;

export function limitText(text: string, limit = TELEGRAM_TEXT_LIMIT): string {
  return text.length > limit ? `${text.slice(0, limit)}\n...trimmed...` : text;
}

export function splitPlainText(text: string, limit = TELEGRAM_TEXT_LIMIT): string[] {
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

export function describeRuntimePhase(message: string, t: Translations): string | null {
  const normalized = message.trim().toLowerCase();
 
  if (normalized.startsWith('llm_config')) {
    return t.tg_phase_preparing;
  }
  if (normalized.startsWith('agent_start')) {
     return t.tg_phase_running_agent;
  }
  if (normalized.startsWith('turn_start')) {
     return t.tg_phase_analyzing;
  }
  if (normalized.startsWith('message_start')) {
     return t.tg_phase_planning;
  }
  if (normalized.startsWith('message_end')) {
     return t.tg_phase_reviewing;
  }
  if (normalized.startsWith('tool_execution_update:')) {
     return t.tg_phase_using_tools;
  }
  if (normalized.startsWith('turn_end')) {
     return t.tg_phase_finalizing;
  }
  if (normalized.startsWith('agent_end')) {
     return t.tg_phase_done;
  }

  return null;
}

export function describeToolPhase(toolName: string, t: Translations): string {
  const normalized = toolName.trim().toLowerCase();
 
  if (
    normalized.includes('read') ||
    normalized.includes('glob') ||
    normalized.includes('grep') ||
    normalized.includes('search')
  ) {
    return t.tg_tool_searching;
  }
 
  if (
    normalized.includes('edit') ||
    normalized.includes('write') ||
    normalized.includes('patch') ||
    normalized.includes('replace')
  ) {
    return t.tg_tool_editing;
  }
 
  if (
    normalized.includes('bash') ||
    normalized.includes('terminal') ||
    normalized.includes('command') ||
    normalized.includes('exec')
  ) {
    return t.tg_tool_executing;
  }
 
  if (normalized.includes('test') || normalized.includes('lint')) {
    return t.tg_tool_testing;
  }
 
  if (normalized.includes('git') || normalized.includes('diff')) {
    return t.tg_tool_git;
  }
 
  return `${t.tg_phase_using_tools}: ${toolName}`;
}

export function summarizeToolArgs(args: unknown): string {
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

export function summarizeToolResult(result: unknown): string {
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

export function summarizeToolError(result: unknown): string {
  if (!result || typeof result !== 'object') {
    return '';
  }

  const directMessage =
    (result as { message?: unknown }).message ||
    (result as { error?: unknown }).error ||
    (result as { details?: { error?: unknown } }).details?.error;

  if (typeof directMessage === 'string') {
    const compact = directMessage.replace(/\s+/g, ' ').trim();
    if (compact) {
      return `error=${compact.length > 120 ? `${compact.slice(0, 117)}...` : compact}`;
    }
  }

  const content = (result as { content?: unknown }).content;
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0] as { type?: unknown; text?: unknown };
    if (first?.type === 'text' && typeof first.text === 'string') {
      const compact = first.text.replace(/\s+/g, ' ').trim();
      if (compact) {
        return `error=${compact.length > 120 ? `${compact.slice(0, 117)}...` : compact}`;
      }
    }
  }

  return '';
}

export function pushSummary(parts: string[], key: string, value: unknown): void {
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

export function formatError(error: unknown): string {
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

export function isLikelyNetworkError(error: unknown): boolean {
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

export function shouldLogTelegramStatus(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized.startsWith('event:')) {
    return false;
  }

  return true;
}

export function compactTelegramStatus(message: string): string {
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

export function parseTelegramChatId(raw?: string): number | null {
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

export function getWorkspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? folder.uri.fsPath : process.cwd();
}

export function getWorkspaceRoots(): string[] {
  const folders = vscode.workspace.workspaceFolders || [];
  const roots = folders.map((folder) => folder.uri.fsPath).filter((value) => value.length > 0);
  if (roots.length > 0) {
    return roots;
  }
  return [process.cwd()];
}

export function getCandidatePaths(rawPath: string, primaryRoot: string): string[] {
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

export async function resolveExistingPath(rawPath: string, primaryRoot: string): Promise<{ path: string; stat: any } | null> {
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

export function buildMissingPathError(rawPath: string, primaryRoot: string): string {
  const candidates = getCandidatePaths(rawPath, primaryRoot);
  const preview = candidates.slice(0, 4).join(', ');
  const suffix = candidates.length > 4 ? ` (+${candidates.length - 4} more)` : '';
  return `Path not found: ${rawPath}. Tried: ${preview}${suffix}`;
}

export async function runCommand(
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
      if (exitCode !== 0 && exitCode !== 1 && stderr.trim().length > 0) {
        reject(new Error(stderr.trim()));
        return;
      }
      resolve({ stdout, stderr, exitCode });
    });
  });
}

export async function runGitCommand(args: string[], timeoutMs = 30_000): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
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

export async function rollbackWorkingTree(): Promise<string> {
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

export function maskToken(token: string): string {
  if (!token) {
    return '(empty)';
  }

  if (token.length <= 8) {
    return '********';
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
