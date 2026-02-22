import { describe, it, expect, vi } from 'vitest';
import * as path from 'node:path';

// Mock vscode API for testing workspaceTools
vi.mock('vscode', () => {
  return {
    workspace: {
      workspaceFolders: [
        {
          uri: { fsPath: '/test/workspace' },
          name: 'workspace'
        }
      ]
    },
    Uri: {
      file: (f: string) => ({ fsPath: f })
    }
  };
});

import { getWorkspaceRoot, createWorkspaceTools } from '../src/tools/workspaceTools';

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
