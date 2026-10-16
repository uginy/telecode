import { describe, it, expect, vi } from 'vitest';
import * as path from 'node:path';

// Mock vscode API for testing workspaceTools
vi.mock('vscode', () => {
  return {
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    env: { language: 'en' },
    workspace: {
      getConfiguration: () => ({ get: () => undefined }),
      workspaceFolders: [
        {
          uri: { fsPath: '/test/workspace' },
          name: 'workspace'
        }
      ]
    },
    Uri: {
      file: (f: string) => ({ fsPath: f })
    },
    DiagnosticSeverity: {
      Error: 0,
      Warning: 1,
      Information: 2,
      Hint: 3,
    }
  };
});

import { getWorkspaceRoot, createWorkspaceTools } from '../src/tools';

describe('Workspace Tools', () => {
  it('getWorkspaceRoot returns mocked workspace folder', () => {
    const root = getWorkspaceRoot();
    expect(root).toBe('/test/workspace');
  });

  describe('createWorkspaceTools', () => {
    it('returns an array of initialized tools', () => {
      const tools = createWorkspaceTools();
      expect(tools.length).toBeGreaterThan(0);
      
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('read_file');
      expect(toolNames).toContain('write_file');
      expect(toolNames).toContain('edit_file');
      expect(toolNames).toContain('bash');
    });

    it('rejects shell working directories and workspace switches outside the project', async () => {
      const tools = createWorkspaceTools();
      const bash = tools.find((tool) => tool.name === 'bash')!;
      const openWorkspace = tools.find((tool) => tool.name === 'open_workspace')!;
      await expect(bash.execute('test', { command: 'pwd', cwd: '/outside' })).rejects.toThrow('restricted to workspace');
      await expect(openWorkspace.execute('test', { path: '/outside' })).rejects.toThrow('restricted to workspace');
    });

    it('all tools have correct shape and descriptions', () => {
      const tools = createWorkspaceTools();
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeDefined();
        expect(tool.parameters).toBeDefined();
        expect(typeof tool.execute).toBe('function');
      }
    });
  });
});
