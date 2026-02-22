import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { DEFAULT_EXCLUDE, renderPath } from '../core/utils';

export const globParams = Type.Object({
  pattern: Type.String({ description: 'VS Code glob pattern, e.g. **/*.ts' }),
  exclude: Type.Optional(Type.String({ description: 'Exclude glob pattern' })),
  maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 2000, description: 'Result cap (default 200)' })),
});

type GlobParams = Static<typeof globParams>;

export const grepParams = Type.Object({
  query: Type.String({ description: 'Text or regex for ripgrep' }),
  glob: Type.Optional(Type.String({ description: 'Optional ripgrep glob pattern, e.g. **/*.ts' })),
  maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000, description: 'Max matches (default 200)' })),
});

type GrepParams = Static<typeof grepParams>;

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

export function createSearchTools(getContext: () => { workingDirectory: string }): AgentTool[] {
  return [
    {
      name: 'glob',
      label: 'Glob',
      description: 'Find files in current working directory using ripgrep file listing.',
      parameters: globParams,
      execute: async (_toolCallId, params) => {
        const { workingDirectory } = getContext();
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
        const { workingDirectory } = getContext();
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
            if (error.code === 'ENOENT' || error.code === 'EACCES') {
              try {
                const result = await fallbackGrep(typed.query, typed.glob, maxResults, workingDirectory);
                resolve(result);
              } catch (fallbackErr) {
                reject(fallbackErr);
              }
              return;
            }
            reject(error);
          });

          child.on('close', (exitCode) => {
            if (exitCode === 1) {
              resolve('No matches found');
              return;
            }
            if (exitCode !== 0) {
              reject(new Error(stderr || `rg failed with exit code ${exitCode}`));
              return;
            }

            const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
            resolve(lines.slice(0, maxResults).join('\n') || 'No matches found');
          });
        });

        return {
          content: [{ type: 'text', text: output }],
          details: {
            cwd,
            query: typed.query,
            maxResults,
          },
        };
      },
    },
  ];
}
