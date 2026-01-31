import * as vscode from 'vscode';

export function getProviderSettings(provider: string, config: vscode.WorkspaceConfiguration) {
  if (provider === 'openai') {
    return {
      modelId: config.get('openai.model') || 'gpt-4o',
      apiKey: config.get('openai.apiKey') || '',
      baseUrl: ''
    };
  }
  if (provider === 'anthropic') {
    return {
      modelId: config.get('anthropic.model') || 'claude-sonnet-4-20250514',
      apiKey: config.get('anthropic.apiKey') || '',
      baseUrl: ''
    };
  }
  if (provider === 'openai-compatible') {
    return {
      modelId: config.get('openaiCompatible.model') || 'llama3.2',
      apiKey: config.get('openaiCompatible.apiKey') || '',
      baseUrl: config.get('openaiCompatible.baseUrl') || 'http://localhost:11434/v1'
    };
  }
  return {
    modelId: config.get('openrouter.model') || 'google/gemini-2.0-flash-exp:free',
    apiKey: config.get('openrouter.apiKey') || '',
    baseUrl: ''
  };
}

export function postWebviewSettings(
  view: vscode.WebviewView | undefined,
  config: vscode.WorkspaceConfiguration
) {
  if (!view) return;
  const provider = config.get<string>('provider') || 'openrouter';
  const providerSettings = getProviderSettings(provider, config);

  view.webview.postMessage({
    type: 'setSettings',
    settings: {
      provider,
      modelId: providerSettings.modelId,
      apiKey: providerSettings.apiKey,
      baseUrl: providerSettings.baseUrl,
      maxTokens: config.get('maxTokens') || 4096,
      temperature: config.get('temperature') || 0.7,
      autoApprove: config.get('autoApprove') ?? true,
      intentRoutingEnabled: config.get('intentRouting.enabled') ?? true,
      intentRoutingModel: config.get('intentRouting.model') || '',
      intentRoutingMaxTokens: config.get('intentRouting.maxTokens') || 256,
      intentRoutingTemperature: config.get('intentRouting.temperature') ?? 0,
      contextUseOpenTabs: config.get('context.useOpenTabs') ?? true,
      contextUseTerminals: config.get('context.useTerminals') ?? true,
      contextUseSearch: config.get('context.useSearch') ?? true,
      contextUseSemantic: config.get('context.useSemantic') ?? true,
      contextSemanticFirst: config.get('context.semanticFirst') ?? true,
      contextMaxOpenTabs: config.get('context.maxOpenTabs') || 8,
      contextMaxSearchSnippets: config.get('context.maxSearchSnippets') || 8,
      contextTrackFiles: config.get('context.trackFiles') ?? true,
      contextWarnStale: config.get('context.warnStale') ?? true
    }
  });
}

export async function applySettingsUpdate(settings: Record<string, unknown>, config: vscode.WorkspaceConfiguration) {
  const provider = (settings.provider as string | undefined) || config.get<string>('provider') || 'openrouter';

  if (settings.provider) await config.update('provider', settings.provider, vscode.ConfigurationTarget.Global);
  if (settings.maxTokens) await config.update('maxTokens', settings.maxTokens, vscode.ConfigurationTarget.Global);
  if (settings.temperature) await config.update('temperature', settings.temperature, vscode.ConfigurationTarget.Global);
  if (settings.autoApprove !== undefined) await config.update('autoApprove', settings.autoApprove, vscode.ConfigurationTarget.Global);
  if (settings.intentRoutingEnabled !== undefined) {
    await config.update('intentRouting.enabled', settings.intentRoutingEnabled, vscode.ConfigurationTarget.Global);
  }
  if (settings.intentRoutingModel !== undefined) {
    await config.update('intentRouting.model', settings.intentRoutingModel, vscode.ConfigurationTarget.Global);
  }
  if (settings.intentRoutingMaxTokens !== undefined) {
    await config.update('intentRouting.maxTokens', settings.intentRoutingMaxTokens, vscode.ConfigurationTarget.Global);
  }
  if (settings.intentRoutingTemperature !== undefined) {
    await config.update('intentRouting.temperature', settings.intentRoutingTemperature, vscode.ConfigurationTarget.Global);
  }
  if (settings.contextUseOpenTabs !== undefined) {
    await config.update('context.useOpenTabs', settings.contextUseOpenTabs, vscode.ConfigurationTarget.Global);
  }
  if (settings.contextUseTerminals !== undefined) {
    await config.update('context.useTerminals', settings.contextUseTerminals, vscode.ConfigurationTarget.Global);
  }
  if (settings.contextUseSearch !== undefined) {
    await config.update('context.useSearch', settings.contextUseSearch, vscode.ConfigurationTarget.Global);
  }
  if (settings.contextUseSemantic !== undefined) {
    await config.update('context.useSemantic', settings.contextUseSemantic, vscode.ConfigurationTarget.Global);
  }
  if (settings.contextSemanticFirst !== undefined) {
    await config.update('context.semanticFirst', settings.contextSemanticFirst, vscode.ConfigurationTarget.Global);
  }
  if (settings.contextMaxOpenTabs !== undefined) {
    await config.update('context.maxOpenTabs', settings.contextMaxOpenTabs, vscode.ConfigurationTarget.Global);
  }
  if (settings.contextMaxSearchSnippets !== undefined) {
    await config.update('context.maxSearchSnippets', settings.contextMaxSearchSnippets, vscode.ConfigurationTarget.Global);
  }
  if (settings.contextTrackFiles !== undefined) {
    await config.update('context.trackFiles', settings.contextTrackFiles, vscode.ConfigurationTarget.Global);
  }
  if (settings.contextWarnStale !== undefined) {
    await config.update('context.warnStale', settings.contextWarnStale, vscode.ConfigurationTarget.Global);
  }

  if (provider === 'openrouter') {
    if (settings.modelId) await config.update('openrouter.model', settings.modelId, vscode.ConfigurationTarget.Global);
    if (settings.apiKey !== undefined) await config.update('openrouter.apiKey', settings.apiKey, vscode.ConfigurationTarget.Global);
  } else if (provider === 'openai') {
    if (settings.modelId) await config.update('openai.model', settings.modelId, vscode.ConfigurationTarget.Global);
    if (settings.apiKey !== undefined) await config.update('openai.apiKey', settings.apiKey, vscode.ConfigurationTarget.Global);
  } else if (provider === 'anthropic') {
    if (settings.modelId) await config.update('anthropic.model', settings.modelId, vscode.ConfigurationTarget.Global);
    if (settings.apiKey !== undefined) await config.update('anthropic.apiKey', settings.apiKey, vscode.ConfigurationTarget.Global);
  } else if (provider === 'openai-compatible') {
    if (settings.modelId) await config.update('openaiCompatible.model', settings.modelId, vscode.ConfigurationTarget.Global);
    if (settings.apiKey !== undefined) await config.update('openaiCompatible.apiKey', settings.apiKey, vscode.ConfigurationTarget.Global);
    if (settings.baseUrl !== undefined) await config.update('openaiCompatible.baseUrl', settings.baseUrl, vscode.ConfigurationTarget.Global);
  }
}
