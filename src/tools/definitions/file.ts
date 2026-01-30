import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { resolveToolPath, checkPathAllowed, renderPath, trimOutput } from '../core/utils';

export const readFileParams = Type.Object({
  path: Type.String({ description: 'Absolute or workspace-relative file path' }),
  startLine: Type.Optional(Type.Integer({ minimum: 1, description: 'Optional 1-based start line' })),
  endLine: Type.Optional(Type.Integer({ minimum: 1, description: 'Optional 1-based end line' })),
});

type ReadFileParams = Static<typeof readFileParams>;

export const writeFileParams = Type.Object({
  path: Type.String({ description: 'Absolute or workspace-relative file path' }),
  content: Type.String({ description: 'Full file content to write' }),
});

type WriteFileParams = Static<typeof writeFileParams>;

export const editFileParams = Type.Object({
  path: Type.String({ description: 'Absolute or workspace-relative file path' }),
  oldText: Type.String({ description: 'Exact text to replace' }),
  newText: Type.String({ description: 'Replacement text' }),
  replaceAll: Type.Optional(Type.Boolean({ description: 'Replace all occurrences (default: false)' })),
  expectedOccurrences: Type.Optional(
    Type.Integer({ minimum: 1, description: 'If provided, replacement fails unless occurrences match' })
  ),
});

type EditFileParams = Static<typeof editFileParams>;

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  return haystack.split(needle).length - 1;
}

export function createFileTools(getContext: () => { workingDirectory: string }): AgentTool[] {
  return [
    {
      name: 'read_file',
      label: 'Read',
      description: 'Read file contents. Supports optional line ranges.',
      parameters: readFileParams,
      execute: async (_toolCallId, params) => {
        const { workingDirectory } = getContext();
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
        const { workingDirectory } = getContext();
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
        const { workingDirectory } = getContext();
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
  ];
}
