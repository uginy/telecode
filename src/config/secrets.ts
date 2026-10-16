import * as vscode from 'vscode';

type SecretSetting = 'apiKey' | 'telegram.botToken';
const names: SecretSetting[] = ['apiKey', 'telegram.botToken'];
const cache = new Map<string, string>();
let storage: vscode.SecretStorage;

function scopes() {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const workspace = vscode.workspace.workspaceFile || folder;
  return [
    { target: vscode.ConfigurationTarget.Global, field: 'globalValue' as const, id: 'global' },
    ...(workspace ? [{ target: vscode.ConfigurationTarget.Workspace, field: 'workspaceValue' as const, id: `workspace:${workspace.toString()}` }] : []),
    ...(folder ? [{ target: vscode.ConfigurationTarget.WorkspaceFolder, field: 'workspaceFolderValue' as const, id: `folder:${folder.toString()}` }] : []),
  ];
}

export async function initializeSecretStorage(secrets: vscode.SecretStorage): Promise<void> {
  storage = secrets;
  await migrateSecretSettings();
}

export async function migrateSecretSettings(): Promise<void> {
  const config = vscode.workspace.getConfiguration('telecode', vscode.workspace.workspaceFolders?.[0]?.uri);
  for (const name of names) {
    const inspected = config.inspect<string>(name);
    for (const scope of scopes()) {
      const key = `telecode.${name}:${scope.id}`;
      const legacy = inspected?.[scope.field];
      if (legacy !== undefined) {
        // Delete plaintext only after the corresponding scoped secret is stored.
        await storage.store(key, legacy.trim());
        cache.set(key, legacy.trim());
        await config.update(name, undefined, scope.target);
      } else {
        const value = await storage.get(key);
        if (value !== undefined) cache.set(key, value);
        else cache.delete(key);
      }
    }
  }
}

export function readSecretSetting(name: SecretSetting): string {
  const config = vscode.workspace.getConfiguration('telecode', vscode.workspace.workspaceFolders?.[0]?.uri);
  const legacy = config.get<string>(name);
  if (legacy) return legacy.trim();
  for (const scope of scopes().reverse()) {
    const value = cache.get(`telecode.${name}:${scope.id}`);
    if (value !== undefined) return value;
  }
  return '';
}

export async function saveSecretSetting(name: SecretSetting, value: string): Promise<void> {
  const scope = scopes().reverse().find((item) => cache.has(`telecode.${name}:${item.id}`));
  const key = `telecode.${name}:${scope?.id ?? 'global'}`;
  await storage.store(key, value.trim());
  cache.set(key, value.trim());
}
