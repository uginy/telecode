import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

type ToolName = 'read_file' | 'write_file' | 'edit_file' | 'glob' | 'grep' | 'bash';

const DEFAULT_EXCLUDE = '**/{.git,node_modules,dist,.next,.turbo,coverage}/**';
const MAX_TEXT_OUTPUT_CHARS = 120_000;
const DEFAULT_BASH_TIMEOUT_MS = 60_000;

const readFileParams = Type.Object({
  path: Type.String({ description: 'Absolute or workspace-relative file path' }),
  startLine: Type.Optional(Type.Integer({ minimum: 1, description: 'Optional 1-based start line' })),
  endLine: Type.Optional(Type.Integer({ minimum: 1, description: 'Optional 1-based end line' })),
});

type ReadFileParams = Static<typeof readFileParams>;

const writeFileParams = Type.Object({
  path: Type.String({ description: 'Absolute or workspace-relative file path' }),
  content: Type.String({ description: 'Full file content to write' }),
});

type WriteFileParams = Static<typeof writeFileParams>;

const editFileParams = Type.Object({
  path: Type.String({ description: 'Absolute or workspace-relative file path' }),
  oldText: Type.String({ description: 'Exact text to replace' }),
  newText: Type.String({ description: 'Replacement text' }),
  replaceAll: Type.Optional(Type.Boolean({ description: 'Replace all occurrences (default: false)' })),
  expectedOccurrences: Type.Optional(
    Type.Integer({ minimum: 1, description: 'If provided, replacement fails unless occurrences match' })
  ),
});

type EditFileParams = Static<typeof editFileParams>;

const globParams = Type.Object({
  pattern: Type.String({ description: 'VS Code glob pattern, e.g. **/*.ts' }),
  exclude: Type.Optional(Type.String({ description: 'Exclude glob pattern' })),
  maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 2000, description: 'Result cap (default 200)' })),
});

type GlobParams = Static<typeof globParams>;

const grepParams = Type.Object({
  query: Type.String({ description: 'Text or regex for ripgrep' }),
  glob: Type.Optional(Type.String({ description: 'Optional ripgrep glob pattern, e.g. **/*.ts' })),
  maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000, description: 'Max matches (default 200)' })),
});

type GrepParams = Static<typeof grepParams>;

const bashParams = Type.Object({
  command: Type.String({ description: 'Shell command to execute' }),
  cwd: Type.Optional(Type.String({ description: 'Optional workspace-relative working directory' })),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 300000, description: 'Timeout in milliseconds' })),
});

type BashParams = Static<typeof bashParams>;

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

function getWorkspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('Open a workspace folder before using AIS Code tools.');
  }
  return folder.uri.fsPath;
}

function resolveWorkspacePath(rawPath: string, workspaceRoot: string): string {
  const candidate = path.isAbsolute(rawPath)
    ? path.normalize(rawPath)
    : path.resolve(workspaceRoot, rawPath);

  const relative = path.relative(workspaceRoot, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path is outside the workspace: ${rawPath}`);
  }

  return candidate;
}

function toRelativePath(fsPath: string, workspaceRoot: string): string {
  const relative = path.relative(workspaceRoot, fsPath);
  return relative.length > 0 ? relative : '.';
}

function trimOutput(text: string, maxChars = MAX_TEXT_OUTPUT_CHARS): string {
  if (text.length <= maxChars) {
    return text;
  }

  const omitted = text.length - maxChars;
  return `${text.slice(0, maxChars)}\n\n... trimmed ${omitted} chars ...`;
}

async function runShellCommand(
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
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        exitCode,
        timedOut,
      });
    });
  });
}

async function fallbackGrep(
  query: string,
  glob: string | undefined,
  maxResults: number,
  workspaceRoot: string
): Promise<string> {
  const files = await vscode.workspace.findFiles(glob || '**/*', DEFAULT_EXCLUDE, 500);
  const matches: string[] = [];

  for (const file of files) {
    if (matches.length >= maxResults) {
      break;
    }

    const document = await vscode.workspace.openTextDocument(file);
    const lines = document.getText().split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].includes(query)) {
        matches.push(`${toRelativePath(file.fsPath, workspaceRoot)}:${index + 1}:${lines[index]}`);
        if (matches.length >= maxResults) {
          break;
        }
      }
    }
  }

  return matches.length > 0 ? matches.join('\n') : 'No matches found';
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  return haystack.split(needle).length - 1;
}

export function createWorkspaceTools(): AgentTool[] {
  return [
    {
      name: 'read_file',
      label: 'Read',
      description: 'Read file contents. Supports optional line ranges.',
      parameters: readFileParams,
      execute: async (_toolCallId, params) => {
        const typed = params as ReadFileParams;
        const workspaceRoot = getWorkspaceRoot();
        const filePath = resolveWorkspacePath(typed.path, workspaceRoot);

        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split(/\r?\n/);

        const startLine = typed.startLine ?? 1;
        const endLine = typed.endLine ?? lines.length;

        if (startLine > endLine) {
          throw new Error(`Invalid range: startLine (${startLine}) is greater than endLine (${endLine}).`);
        }

        const selected = lines.slice(startLine - 1, endLine).join('\n');

        return {
          content: [{ type: 'text', text: trimOutput(selected) }],
          details: {
            path: toRelativePath(filePath, workspaceRoot),
            startLine,
            endLine,
            totalLines: lines.length,
          },
        };
      },
    },
    {
      name: 'write_file',
      label: 'Write',
      description: 'Write full file content, creating folders if needed.',
      parameters: writeFileParams,
      execute: async (_toolCallId, params) => {
        const typed = params as WriteFileParams;
        const workspaceRoot = getWorkspaceRoot();
        const filePath = resolveWorkspacePath(typed.path, workspaceRoot);

        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, typed.content, 'utf8');

        return {
          content: [{ type: 'text', text: `Wrote ${typed.content.length} chars to ${toRelativePath(filePath, workspaceRoot)}` }],
          details: {
            path: toRelativePath(filePath, workspaceRoot),
            bytes: Buffer.byteLength(typed.content, 'utf8'),
          },
        };
      },
    },
    {
      name: 'edit_file',
      label: 'Edit',
      description: 'Replace text in a file by exact match.',
      parameters: editFileParams,
      execute: async (_toolCallId, params) => {
        const typed = params as EditFileParams;
        const workspaceRoot = getWorkspaceRoot();
        const filePath = resolveWorkspacePath(typed.path, workspaceRoot);

        if (typed.oldText.length === 0) {
          throw new Error('oldText must not be empty.');
        }

        const source = await fs.readFile(filePath, 'utf8');
        const occurrences = countOccurrences(source, typed.oldText);

        if (occurrences === 0) {
          throw new Error(`No matches found for oldText in ${toRelativePath(filePath, workspaceRoot)}.`);
        }

        if (typed.expectedOccurrences !== undefined && occurrences !== typed.expectedOccurrences) {
          throw new Error(
            `Expected ${typed.expectedOccurrences} occurrences but found ${occurrences} in ${toRelativePath(filePath, workspaceRoot)}.`
          );
        }

        const replaceAll = typed.replaceAll === true;
        const replacementCount = replaceAll ? occurrences : 1;
        const updated = replaceAll
          ? source.split(typed.oldText).join(typed.newText)
          : source.replace(typed.oldText, typed.newText);

        await fs.writeFile(filePath, updated, 'utf8');

        return {
          content: [
            {
              type: 'text',
              text: `Updated ${toRelativePath(filePath, workspaceRoot)} (${replacementCount} replacement${replacementCount === 1 ? '' : 's'}).`,
            },
          ],
          details: {
            path: toRelativePath(filePath, workspaceRoot),
            replacements: replacementCount,
          },
        };
      },
    },
    {
      name: 'glob',
      label: 'Glob',
      description: 'Find files using a glob pattern.',
      parameters: globParams,
      execute: async (_toolCallId, params) => {
        const typed = params as GlobParams;
        const workspaceRoot = getWorkspaceRoot();

        const files = await vscode.workspace.findFiles(
          typed.pattern,
          typed.exclude || DEFAULT_EXCLUDE,
          typed.maxResults ?? 200
        );

        const output = files.map((uri) => toRelativePath(uri.fsPath, workspaceRoot)).join('\n');

        return {
          content: [{ type: 'text', text: output || 'No files matched.' }],
          details: {
            count: files.length,
          },
        };
      },
    },
    {
      name: 'grep',
      label: 'Grep',
      description: 'Search file contents using ripgrep with line numbers.',
      parameters: grepParams,
      execute: async (_toolCallId, params) => {
        const typed = params as GrepParams;
        const workspaceRoot = getWorkspaceRoot();
        const maxResults = typed.maxResults ?? 200;

        const args = ['--line-number', '--no-heading', '--color', 'never', '--max-count', String(maxResults)];
        if (typed.glob) {
          args.push('-g', typed.glob);
        }
        args.push(typed.query, '.');

        const output = await new Promise<string>((resolve, reject) => {
          const child = spawn('rg', args, {
            cwd: workspaceRoot,
            env: process.env,
          });

          let stdout = '';
          let stderr = '';

          child.stdout.on('data', (chunk: Buffer | string) => {
            stdout += chunk.toString();
          });

          child.stderr.on('data', (chunk: Buffer | string) => {
            stderr += chunk.toString();
          });

          child.on('error', async (error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') {
              resolve(await fallbackGrep(typed.query, typed.glob, maxResults, workspaceRoot));
              return;
            }
            reject(error);
          });

          child.on('close', (exitCode) => {
            if (exitCode === 0) {
              resolve(stdout.length > 0 ? trimOutput(stdout) : 'No matches found');
              return;
            }

            if (exitCode === 1) {
              resolve('No matches found');
              return;
            }

            reject(new Error(stderr || `ripgrep failed with exit code ${exitCode}`));
          });
        });

        return {
          content: [{ type: 'text', text: output }],
          details: {
            query: typed.query,
            maxResults,
          },
        };
      },
    },
    {
      name: 'bash',
      label: 'Bash',
      description: 'Execute a shell command and return stdout/stderr.',
      parameters: bashParams,
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const typed = params as BashParams;
        const workspaceRoot = getWorkspaceRoot();
        const cwd = typed.cwd ? resolveWorkspacePath(typed.cwd, workspaceRoot) : workspaceRoot;
        const timeoutMs = typed.timeoutMs ?? DEFAULT_BASH_TIMEOUT_MS;

        onUpdate?.({
          content: [{ type: 'text', text: `Running in ${toRelativePath(cwd, workspaceRoot)}: ${typed.command}` }],
          details: {},
        });

        const result = await runShellCommand(typed.command, cwd, timeoutMs, signal);

        if (result.timedOut) {
          throw new Error(`Command timed out after ${timeoutMs}ms.`);
        }

        if (result.exitCode !== 0) {
          const combined = [result.stdout, result.stderr].filter((part) => part.length > 0).join('\n');
          throw new Error(`Command failed with exit code ${result.exitCode}.\n${combined}`);
        }

        const rendered = [
          result.stdout.length > 0 ? result.stdout : '(no stdout)',
          result.stderr.length > 0 ? `\n[stderr]\n${result.stderr}` : '',
        ].join('');

        return {
          content: [{ type: 'text', text: trimOutput(rendered) }],
          details: {
            command: typed.command,
            cwd: toRelativePath(cwd, workspaceRoot),
            exitCode: result.exitCode,
          },
        };
      },
    },
  ];
}

const TOOL_NAME_ALIASES: Record<ToolName, string[]> = {
  read_file: ['read', 'read_file'],
  write_file: ['write', 'write_file'],
  edit_file: ['edit', 'edit_file'],
  glob: ['glob'],
  grep: ['grep'],
  bash: ['bash'],
};

export function filterToolsByAllowed(tools: AgentTool[], allowedTools: string[]): AgentTool[] {
  const normalizedAllowed = new Set(allowedTools.map((name) => name.trim().toLowerCase()));

  if (normalizedAllowed.size === 0) {
    return tools;
  }

  const filtered = tools.filter((tool) => {
    const aliases = TOOL_NAME_ALIASES[tool.name as ToolName] || [tool.name.toLowerCase()];
    return aliases.some((alias) => normalizedAllowed.has(alias));
  });

  return filtered.length > 0 ? filtered : tools;
}
