import * as vscode from 'vscode';

export interface AgentSettings {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxSteps: number;
  allowedTools: string[];
  responseStyle: 'concise' | 'normal' | 'detailed';
  language: 'ru' | 'en';
}

export interface TelegramSettings {
  enabled: boolean;
  botToken: string;
  chatId?: string;
  apiRoot?: string;
  forceIPv4: boolean;
}

export interface AISCodeSettings {
  agent: AgentSettings;
  telegram: TelegramSettings;
}

const DEFAULT_ALLOWED_TOOLS = [
  'Read',
  'Edit',
  'Write',
  'Bash',
  'Glob',
  'Grep',
] as const;

function readStringArray(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return normalized.length > 0 ? normalized : [...fallback];
}

function readPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function providerRequiresApiKey(provider: string): boolean {
  const normalized = provider.trim().toLowerCase();
  return normalized !== 'ollama';
}

export function readAISCodeSettings(): AISCodeSettings {
  const config = vscode.workspace.getConfiguration('aisCode');

  const provider = (config.get<string>('provider') || 'openrouter').trim();
  const model = (config.get<string>('model') || 'arcee-ai/trinity-large-preview:free').trim();
  const apiKey = (config.get<string>('apiKey') || '').trim();
  const baseUrlRaw = (config.get<string>('baseUrl') || '').trim();

  const maxSteps = readPositiveNumber(config.get<number>('maxSteps'), 100);
  const allowedTools = readStringArray(config.get<unknown>('allowedTools'), DEFAULT_ALLOWED_TOOLS);
  
  // Response style setting
  const responseStyleRaw = config.get<string>('responseStyle') || 'concise';
  const responseStyle = (responseStyleRaw === 'concise' || responseStyleRaw === 'normal' || responseStyleRaw === 'detailed') 
    ? responseStyleRaw 
    : 'concise';

  const languageRaw = config.get<string>('language') || 'ru';
  const language = (languageRaw === 'ru' || languageRaw === 'en') ? languageRaw : 'ru';

  const telegramEnabled = config.get<boolean>('telegram.enabled') === true;
  const telegramBotToken = (config.get<string>('telegram.botToken') || '').trim();
  const telegramChatIdRaw = (config.get<string>('telegram.chatId') || '').trim();
  const telegramApiRootRaw = (config.get<string>('telegram.apiRoot') || '').trim();
  const telegramForceIPv4 = config.get<boolean>('telegram.forceIPv4', true) !== false;

  return {
    agent: {
      provider,
      model,
      apiKey,
      baseUrl: baseUrlRaw.length > 0 ? baseUrlRaw : undefined,
      maxSteps,
      allowedTools,
      responseStyle,
      language,
    },
    telegram: {
      enabled: telegramEnabled,
      botToken: telegramBotToken,
      chatId: telegramChatIdRaw.length > 0 ? telegramChatIdRaw : undefined,
      apiRoot: telegramApiRootRaw.length > 0 ? telegramApiRootRaw : undefined,
      forceIPv4: telegramForceIPv4,
    },
  };
}
