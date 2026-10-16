import { beforeEach, describe, expect, it, vi } from 'vitest';

const { values, update } = vi.hoisted(() => ({
  values: new Map<string, Record<string, string>>(),
  update: vi.fn(async (name: string, _value: unknown, target: number) => {
    delete values.get(name)?.[['globalValue', 'workspaceValue', 'workspaceFolderValue'][target - 1]];
  }),
}));

vi.mock('vscode', () => ({
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  workspace: {
    workspaceFolders: [{ uri: { toString: () => 'file:///project' } }],
    getConfiguration: () => ({
      inspect: (name: string) => values.get(name),
      get: (name: string) => {
        const value = values.get(name);
        return value?.workspaceFolderValue ?? value?.workspaceValue ?? value?.globalValue;
      },
      update,
    }),
  },
}));

import { initializeSecretStorage, readSecretSetting, saveSecretSetting } from '../src/config/secrets';

describe('credential storage', () => {
  beforeEach(() => { values.clear(); update.mockClear(); });

  it('migrates each scope without losing the global credential', async () => {
    values.set('apiKey', { globalValue: 'global-key', workspaceValue: 'workspace-key' });
    const saved = new Map<string, string>();
    const secrets = {
      get: vi.fn(async (key: string) => saved.get(key)),
      store: vi.fn(async (key: string, value: string) => { saved.set(key, value); }),
    };
    await initializeSecretStorage(secrets as never);
    expect(saved.get('telecode.apiKey:global')).toBe('global-key');
    expect(saved.get('telecode.apiKey:workspace:file:///project')).toBe('workspace-key');
    expect(values.get('apiKey')).toEqual({});
    expect(readSecretSetting('apiKey')).toBe('workspace-key');
    await saveSecretSetting('apiKey', 'new-workspace-key');
    expect(readSecretSetting('apiKey')).toBe('new-workspace-key');
    expect(saved.get('telecode.apiKey:global')).toBe('global-key');
    await saveSecretSetting('telegram.botToken', 'bot-token');
    expect(readSecretSetting('telegram.botToken')).toBe('bot-token');
    await saveSecretSetting('telegram.botToken', '');
    expect(readSecretSetting('telegram.botToken')).toBe('');
  });

  it('keeps plaintext credentials when secure storage fails', async () => {
    values.set('apiKey', { globalValue: 'keep-me' });
    const secrets = { get: vi.fn(), store: vi.fn().mockRejectedValue(new Error('locked')) };
    await expect(initializeSecretStorage(secrets as never)).rejects.toThrow('locked');
    expect(update).not.toHaveBeenCalled();
    expect(values.get('apiKey')?.globalValue).toBe('keep-me');
  });
});
