import * as vscode from 'vscode';
import { PROVIDER_CATALOG, normalizeProvider } from '../agent/providerCatalog';

type SecretSetting = 'apiKey' | 'telegram.botToken';
const names: SecretSetting[] = ['apiKey', 'telegram.botToken'];
const cache = new Map<string, string>();
const providerKeys = new Map<string, string>();
let storage: vscode.SecretStorage;

const providerKeyName = (provider: string) => `telecode.apiKey.provider:${provider}`;
const currentProvider = () =>
  normalizeProvider(vscode.workspace.getConfiguration('telecode').get<string>('provider') || 'openrouter');

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
  await loadProviderApiKeys([...PROVIDER_CATALOG.map((option) => option.id), currentProvider()]);
  // The old single key (also set by editing telecode.apiKey by hand) belongs to the selected provider.
  const legacyKey = readSecretSetting('apiKey');
  if (legacyKey) {
    await saveProviderApiKey(currentProvider(), legacyKey);
    await saveSecretSetting('apiKey', '');
  }
}

export async function loadProviderApiKeys(providers: string[]): Promise<void> {
  for (const provider of new Set(providers.map(normalizeProvider))) {
    const value = await storage.get(providerKeyName(provider));
    if (value !== undefined) providerKeys.set(provider, value);
  }
}

export function readProviderApiKey(provider: string): string {
  return providerKeys.get(normalizeProvider(provider)) ?? '';
}

/** Non-empty keys by provider id, for the settings form. */
export function readProviderApiKeys(): Record<string, string> {
  return Object.fromEntries([...providerKeys].filter(([, value]) => value));
}

export async function saveProviderApiKey(provider: string, value: string): Promise<void> {
  const id = normalizeProvider(provider);
  if (!id || (providerKeys.get(id) ?? '') === value.trim()) return;
  await storage.store(providerKeyName(id), value.trim());
  providerKeys.set(id, value.trim());
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
