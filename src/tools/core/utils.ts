import * as path from 'node:path';
import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import { readTelecodeSettings } from '../../config/settings';

export const DEFAULT_EXCLUDE = '**/{.git,node_modules,dist,.next,.turbo,coverage}/**';
export const MAX_TEXT_OUTPUT_CHARS = 120_000;
export const DEFAULT_BASH_TIMEOUT_MS = 60_000;

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export function getWorkspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? folder.uri.fsPath : process.cwd();
}

/** Expand leading ~ to the user home directory. */
export function expandTilde(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed === '~') {
    return process.env.HOME || process.env.USERPROFILE || trimmed;
  }
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return home ? path.join(home, trimmed.slice(2)) : trimmed;
  }
  return trimmed;
}

export function resolveToolPath(rawPath: string, cwd: string): string {
  const expanded = expandTilde(rawPath);
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(cwd, expanded);
}

export function renderPath(fsPath: string, cwd: string): string {
  const relative = path.relative(cwd, fsPath);
  return relative.length > 0 && !relative.startsWith('..') ? relative : fsPath;
}

export function isWithinWorkspace(targetPath: string): boolean {
  const settings = readTelecodeSettings();
  if (settings.agent.allowOutOfWorkspace) {
    return true;
  }
  const workspaceRoot = getWorkspaceRoot();
  const relative = path.relative(workspaceRoot, targetPath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function checkPathAllowed(targetPath: string, operation: string): void {
  if (!isWithinWorkspace(targetPath)) {
    const workspaceRoot = getWorkspaceRoot();
    throw new Error(
      `Operation "${operation}" is restricted to workspace folder "${workspaceRoot}". ` +
      `Target path "${targetPath}" is outside the workspace. ` +
      `Enable "telecode.allowOutOfWorkspace" in settings to allow access outside the workspace.`
    );
  }
}

export function trimOutput(text: string, maxChars = MAX_TEXT_OUTPUT_CHARS): string {
  if (text.length <= maxChars) {
    return text;
  }

  const omitted = text.length - maxChars;
  return `${text.slice(0, maxChars)}\n\n... trimmed ${omitted} chars ...`;
}

export async function runShellCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    const onAbort = () => child.kill('SIGTERM');
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      reject(error);
    });

    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      resolve({
        stdout,
        stderr,
        exitCode,
        timedOut,
      });
    });
  });
}
