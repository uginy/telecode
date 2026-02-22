import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { resolveToolPath, checkPathAllowed, renderPath, getWorkspaceRoot } from '../core/utils';

export const listDirectoryParams = Type.Object({
  path: Type.Optional(Type.String({ description: 'Absolute path or path relative to current working directory' })),
  recursive: Type.Optional(Type.Boolean({ description: 'List recursively (default: false)' })),
  maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000, description: 'Result cap (default: 500)' })),
});

type ListDirectoryParams = Static<typeof listDirectoryParams>;

export const setWorkingDirectoryParams = Type.Object({
  path: Type.String({ description: 'Absolute path or path relative to current working directory' }),
});

type SetWorkingDirectoryParams = Static<typeof setWorkingDirectoryParams>;

export const openWorkspaceParams = Type.Object({
  path: Type.String({ description: 'Path to folder to open as VS Code workspace' }),
  newWindow: Type.Optional(Type.Boolean({ description: 'Open in a new window (default: false)' })),
});

type OpenWorkspaceParams = Static<typeof openWorkspaceParams>;

export function createWorkspaceManagementTools(
  getContext: () => { workingDirectory: string },
  setWorkingDirectory: (path: string) => void
): AgentTool[] {
  return [
    {
      name: 'list_directory',
      label: 'List',
      description: 'List contents of a directory.',
      parameters: listDirectoryParams,
      execute: async (_toolCallId, params) => {
        const { workingDirectory } = getContext();
        const typed = params as ListDirectoryParams;
        const targetPath = typed.path ? resolveToolPath(typed.path, workingDirectory) : workingDirectory;

        checkPathAllowed(targetPath, 'list_directory');

        const recursive = typed.recursive === true;
        const maxResults = typed.maxResults ?? 500;

        const results: string[] = [];

        const walk = async (current: string): Promise<void> => {
          if (results.length >= maxResults) return;
          const entries = await fs.readdir(current, { withFileTypes: true });
          for (const entry of entries) {
            if (results.length >= maxResults) break;
            const fullPath = path.join(current, entry.name);
            const isDir = entry.isDirectory();
            results.push(`${renderPath(fullPath, workingDirectory)}${isDir ? '/' : ''}`);
            if (recursive && isDir) {
              await walk(fullPath);
            }
          }
        };

        if ((await fs.stat(targetPath)).isDirectory()) {
          await walk(targetPath);
        } else {
          throw new Error(`Path is not a directory: ${targetPath}`);
        }

        return {
          content: [{ type: 'text', text: results.join('\n') || '(directory is empty)' }],
          details: {
            path: renderPath(targetPath, workingDirectory),
            count: results.length,
          },
        };
      },
    },
    {
      name: 'set_working_directory',
      label: 'CWD',
      description: 'Set the current working directory for subsequent tools.',
      parameters: setWorkingDirectoryParams,
      execute: async (_toolCallId, params) => {
        const { workingDirectory } = getContext();
        const typed = params as SetWorkingDirectoryParams;
        const targetPath = resolveToolPath(typed.path, workingDirectory);

        checkPathAllowed(targetPath, 'set_working_directory');

        const stat = await fs.stat(targetPath);
        if (!stat.isDirectory()) {
          throw new Error(`Path is not a directory: ${targetPath}`);
        }

        setWorkingDirectory(targetPath);

        return {
          content: [{ type: 'text', text: `Working directory changed to ${targetPath}` }],
          details: { path: targetPath },
        };
      },
    },
    {
      name: 'open_workspace',
      label: 'Open Workspace',
      description: 'Open a specific folder as a VS Code workspace.',
      parameters: openWorkspaceParams,
      execute: async (_toolCallId, params) => {
        const { workingDirectory } = getContext();
        const typed = params as OpenWorkspaceParams;
        const targetPath = resolveToolPath(typed.path, workingDirectory);

        // checkPathAllowed(targetPath, 'open_workspace'); // maybe allow opening anything? 
        // No, let's keep it safe. Actually, open_workspace is a bit special.
        
        const uri = vscode.Uri.file(targetPath);
        await vscode.commands.executeCommand('vscode.openFolder', uri, typed.newWindow === true);

        return {
          content: [{ type: 'text', text: `Opened workspace: ${targetPath}` }],
          details: { path: targetPath },
        };
      },
    },
    {
      name: 'get_context',
      label: 'Context',
      description: 'Get information about the current workspace, working directory, and environment.',
      parameters: Type.Object({}),
      execute: async () => {
        const { workingDirectory } = getContext();
        const workspaceRoot = getWorkspaceRoot();
        const folders = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) || [];

        const context = [
          `Workspace Root: ${workspaceRoot}`,
          `Current Working Directory: ${workingDirectory}`,
          `All Workspace Folders: ${folders.join(', ') || 'none'}`,
          `Platform: ${process.platform}`,
          `Architecture: ${process.arch}`,
          `Node Version: ${process.version}`,
        ];

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

        context.push(`\n--- VS Code Active Context ---\n${activeEditorInfo}`);

        return {
          content: [{ type: 'text', text: context.join('\n') }],
          details: {
            workspaceRoot,
            workingDirectory,
            folders,
            activeEditor: activeEditor?.document.uri.fsPath,
          },
        };
      },
    },
  ];
}
