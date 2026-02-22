import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { readAISCodeSettings } from '../config/settings';

type ToolName =
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'glob'
  | 'grep'
  | 'bash'
  | 'list_directory'
  | 'set_working_directory'
  | 'open_workspace'
  | 'get_context';

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
  cwd: Type.Optional(Type.String({ description: 'Optional absolute/relative working directory' })),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 300000, description: 'Timeout in milliseconds' })),
});

type BashParams = Static<typeof bashParams>;

const listDirectoryParams = Type.Object({
  path: Type.Optional(Type.String({ description: 'Absolute path or path relative to current working directory' })),
  recursive: Type.Optional(Type.Boolean({ description: 'List recursively (default: false)' })),
  maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000, description: 'Result cap (default: 500)' })),
});

type ListDirectoryParams = Static<typeof listDirectoryParams>;

const setWorkingDirectoryParams = Type.Object({
  path: Type.String({ description: 'Absolute path or path relative to current working directory' }),
});

type SetWorkingDirectoryParams = Static<typeof setWorkingDirectoryParams>;

const openWorkspaceParams = Type.Object({
  path: Type.String({ description: 'Path to folder to open as VS Code workspace' }),
  newWindow: Type.Optional(Type.Boolean({ description: 'Open in a new window (default: false)' })),
});

type OpenWorkspaceParams = Static<typeof openWorkspaceParams>;

interface ProcessResult {
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
function expandTilde(rawPath: string): string {
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

function resolveToolPath(rawPath: string, cwd: string): string {
  const expanded = expandTilde(rawPath);
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(cwd, expanded);
}

function renderPath(fsPath: string, cwd: string): string {
  const relative = path.relative(cwd, fsPath);
  return relative.length > 0 && !relative.startsWith('..') ? relative : fsPath;
}

function isWithinWorkspace(targetPath: string): boolean {
  const settings = readAISCodeSettings();
  if (settings.agent.allowOutOfWorkspace) {
    return true;
  }
  const workspaceRoot = getWorkspaceRoot();
  const relative = path.relative(workspaceRoot, targetPath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function checkPathAllowed(targetPath: string, operation: string): void {
  if (!isWithinWorkspace(targetPath)) {
    const workspaceRoot = getWorkspaceRoot();
    throw new Error(
      `Operation "${operation}" is restricted to workspace folder "${workspaceRoot}". ` +
      `Target path "${targetPath}" is outside the workspace. ` +
      `Enable "aisCode.allowOutOfWorkspace" in settings to allow access outside the workspace.`
    );
  }
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
  baseDirectory: string
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
        matches.push(`${renderPath(file.fsPath, baseDirectory)}:${index + 1}:${lines[index]}`);
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
  let workingDirectory = getWorkspaceRoot();

  const resolveCwdInput = (cwdInput?: string): string => {
    if (!cwdInput || cwdInput.trim().length === 0) {
      return workingDirectory;
    }
    return resolveToolPath(cwdInput.trim(), workingDirectory);
  };

  return [
    {
      name: 'read_file',
      label: 'Read',
      description: 'Read file contents. Supports optional line ranges.',
      parameters: readFileParams,
      execute: async (_toolCallId, params) => {
        const typed = params as ReadFileParams;
        const filePath = resolveToolPath(typed.path, workingDirectory);

        checkPathAllowed(filePath, 'read_file');

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
            path: renderPath(filePath, workingDirectory),
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
        const filePath = resolveToolPath(typed.path, workingDirectory);

        checkPathAllowed(filePath, 'write_file');

        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, typed.content, 'utf8');

        return {
          content: [{ type: 'text', text: `Wrote ${typed.content.length} chars to ${renderPath(filePath, workingDirectory)}` }],
          details: {
            path: renderPath(filePath, workingDirectory),
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
        const filePath = resolveToolPath(typed.path, workingDirectory);

        checkPathAllowed(filePath, 'edit_file');

        if (typed.oldText.length === 0) {
          throw new Error('oldText must not be empty.');
        }

        const source = await fs.readFile(filePath, 'utf8');
        const occurrences = countOccurrences(source, typed.oldText);

        if (occurrences === 0) {
          throw new Error(`No matches found for oldText in ${renderPath(filePath, workingDirectory)}.`);
        }

        if (typed.expectedOccurrences !== undefined && occurrences !== typed.expectedOccurrences) {
          throw new Error(
            `Expected ${typed.expectedOccurrences} occurrences but found ${occurrences} in ${renderPath(filePath, workingDirectory)}.`
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
              text: `Updated ${renderPath(filePath, workingDirectory)} (${replacementCount} replacement${replacementCount === 1 ? '' : 's'}).`,
            },
          ],
          details: {
            path: renderPath(filePath, workingDirectory),
            replacements: replacementCount,
          },
        };
      },
    },
    {
      name: 'glob',
      label: 'Glob',
      description: 'Find files in current working directory using ripgrep file listing.',
      parameters: globParams,
      execute: async (_toolCallId, params) => {
        const typed = params as GlobParams;
        const maxResults = typed.maxResults ?? 200;
        const cwd = workingDirectory;
        const exclude = typed.exclude || DEFAULT_EXCLUDE;
        const args = ['--files', '-g', typed.pattern, '-g', `!${exclude}`];

        const output = await new Promise<string>((resolve, reject) => {
          const child = spawn('rg', args, { cwd, env: process.env });
          let stdout = '';
          let stderr = '';

          child.stdout.on('data', (chunk: Buffer | string) => {
            stdout += chunk.toString();
          });

          child.stderr.on('data', (chunk: Buffer | string) => {
            stderr += chunk.toString();
          });

          child.on('error', async (error: NodeJS.ErrnoException) => {
            // rg not found or not executable – fall back to VS Code API
            if (error.code === 'ENOENT' || error.code === 'EACCES') {
              try {
                const files = await vscode.workspace.findFiles(typed.pattern, exclude, maxResults);
                const lines = files.map((f) => f.fsPath).slice(0, maxResults);
                resolve(lines.length > 0 ? lines.join('\n') : 'No files matched.');
              } catch (fallbackErr) {
                reject(fallbackErr);
              }
              return;
            }
            reject(error);
          });

          child.on('close', (exitCode) => {
            if (exitCode !== 0 && exitCode !== 1) {
              reject(new Error(stderr || `rg --files failed with exit code ${exitCode}`));
              return;
            }

            const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
            resolve(lines.slice(0, maxResults).join('\n') || 'No files matched.');
          });
        });

        return {
          content: [{ type: 'text', text: output }],
          details: {
            cwd,
            maxResults,
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
        const cwd = workingDirectory;
        const maxResults = typed.maxResults ?? 200;

        const args = ['--line-number', '--no-heading', '--color', 'never', '--max-count', String(maxResults)];
        if (typed.glob) {
          args.push('-g', typed.glob);
        }
        args.push(typed.query, '.');

        const output = await new Promise<string>((resolve, reject) => {
          const child = spawn('rg', args, {
            cwd,
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
              resolve(await fallbackGrep(typed.query, typed.glob, maxResults, cwd));
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
            cwd,
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
        const cwd = resolveCwdInput(typed.cwd);
        const timeoutMs = typed.timeoutMs ?? DEFAULT_BASH_TIMEOUT_MS;

        checkPathAllowed(cwd, 'bash');

        onUpdate?.({
          content: [{ type: 'text', text: `Running in ${renderPath(cwd, workingDirectory)}: ${typed.command}` }],
          details: {},
        });

        const result = await runShellCommand(typed.command, cwd, timeoutMs, signal);

        if (result.timedOut) {
          throw new Error(`Command timed out after ${timeoutMs}ms.`);
        }

        if (result.exitCode !== 0) {
          const combined = [result.stdout, result.stderr].filter((part) => part.length > 0).join('\n');
          // If there is stdout output, return it as a warning instead of throwing.
          // This handles commands like `find` that exit 1 due to permission denied
          // on some dirs but still produce useful results.
          if (result.stdout.trim().length > 0) {
            const warning = `[exit code ${result.exitCode}${result.stderr.trim() ? ` — ${result.stderr.trim().split('\n')[0]}` : ''}]`;
            return {
              content: [{ type: 'text', text: trimOutput(`${result.stdout}\n${warning}`) }],
              details: {
                command: typed.command,
                cwd,
                exitCode: result.exitCode,
              },
            };
          }
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
            cwd,
            exitCode: result.exitCode,
          },
        };
      },
    },
    {
      name: 'list_directory',
      label: 'List',
      description: 'List files/directories in any path on this machine.',
      parameters: listDirectoryParams,
      execute: async (_toolCallId, params) => {
        const typed = params as ListDirectoryParams;
        const target = resolveCwdInput(typed.path);

        checkPathAllowed(target, 'list_directory');

        const maxResults = typed.maxResults ?? 500;
        const recursive = typed.recursive === true;
        const command = recursive
          ? `find . -mindepth 1 -print | sed 's#^./##' | head -n ${maxResults}`
          : `ls -la`;
        const result = await runShellCommand(command, target, DEFAULT_BASH_TIMEOUT_MS);

        if (result.exitCode !== 0) {
          throw new Error(result.stderr || `Failed to list directory ${target}`);
        }

        return {
          content: [{ type: 'text', text: result.stdout.length > 0 ? result.stdout : '(empty)' }],
          details: {
            cwd: target,
            recursive,
            maxResults,
          },
        };
      },
    },
    {
      name: 'set_working_directory',
      label: 'Set CWD',
      description: 'Switch current working directory for all other tools.',
      parameters: setWorkingDirectoryParams,
      execute: async (_toolCallId, params) => {
        const typed = params as SetWorkingDirectoryParams;
        const next = resolveToolPath(typed.path, workingDirectory);

        checkPathAllowed(next, 'set_working_directory');

        const stat = await fs.stat(next);
        if (!stat.isDirectory()) {
          throw new Error(`Not a directory: ${next}`);
        }
        workingDirectory = next;
        return {
          content: [{ type: 'text', text: `Working directory switched to: ${workingDirectory}` }],
          details: { cwd: workingDirectory },
        };
      },
    },
    {
      name: 'open_workspace',
      label: 'Open Workspace',
      description: 'Open another folder as VS Code workspace.',
      parameters: openWorkspaceParams,
      execute: async (_toolCallId, params) => {
        const typed = params as OpenWorkspaceParams;
        const target = resolveToolPath(typed.path, workingDirectory);

        checkPathAllowed(target, 'open_workspace');

        const stat = await fs.stat(target);
        if (!stat.isDirectory()) {
          throw new Error(`Not a directory: ${target}`);
        }

        const ok = await vscode.commands.executeCommand<boolean>(
          'vscode.openFolder',
          vscode.Uri.file(target),
          typed.newWindow === true
        );
        workingDirectory = target;

        return {
          content: [{ type: 'text', text: `Workspace open requested: ${target} (newWindow=${typed.newWindow === true})` }],
          details: { path: target, result: ok === true ? 'ok' : 'requested' },
        };
      },
    },
    {
      name: 'get_context',
      label: 'Context',
      description: 'Show current agent execution context.',
      parameters: Type.Object({}),
      execute: async () => {
        const workspaceFolders = (vscode.workspace.workspaceFolders || []).map((folder) => folder.uri.fsPath);
        
        let activeEditorInfo = 'No active editor';
        const activeEditor = vscode.window.activeTextEditor;
        
        if (activeEditor) {
          const doc = activeEditor.document;
          const selection = activeEditor.selection;
          
          let selectionText = '';
          if (!selection.isEmpty) {
            selectionText = doc.getText(selection);
          }
          
          activeEditorInfo = [
            `Active file: ${doc.uri.fsPath}`,
            `Language: ${doc.languageId}`,
            `Cursor line: ${selection.active.line + 1}`,
            selectionText ? `Selected text:\n${selectionText}` : 'No text selected.',
          ].join('\n');
        }

        return {
          content: [
            {
              type: 'text',
              text: [
                `workingDirectory: ${workingDirectory}`,
                `workspaceFolders: ${workspaceFolders.length > 0 ? workspaceFolders.join(', ') : '(none)'}`,
                `\n--- VS Code Active Context ---\n${activeEditorInfo}`,
              ].join('\n'),
            },
          ],
          details: { workingDirectory, workspaceFolders, activeEditor: activeEditor?.document.uri.fsPath },
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
  list_directory: ['list', 'list_directory'],
  set_working_directory: ['set_cwd', 'set_working_directory'],
  open_workspace: ['open_workspace', 'workspace'],
  get_context: ['get_context', 'context'],
};

const ALWAYS_ALLOWED_TOOLS = new Set(['set_working_directory', 'list_directory', 'open_workspace', 'get_context']);

export function filterToolsByAllowed(tools: AgentTool[], allowedTools: string[]): AgentTool[] {
  const normalizedAllowed = new Set(allowedTools.map((name) => name.trim().toLowerCase()));

  if (normalizedAllowed.size === 0) {
    return tools;
  }

  const filtered = tools.filter((tool) => {
    if (ALWAYS_ALLOWED_TOOLS.has(tool.name)) {
      return true;
    }
    const aliases = TOOL_NAME_ALIASES[tool.name as ToolName] || [tool.name.toLowerCase()];
    return aliases.some((alias) => normalizedAllowed.has(alias));
  });

  return filtered.length > 0 ? filtered : tools;
}
