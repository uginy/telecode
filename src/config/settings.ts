import * as vscode from 'vscode';

export interface AgentSettings {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxSteps: number;
  allowedTools: string[];
  responseStyle: 'concise' | 'normal' | 'detailed';
  language: 'ru' | 'en' | 'auto';
  uiLanguage: 'ru' | 'en' | 'auto';
  allowOutOfWorkspace: boolean;
  logMaxChars: number;
  channelLogLines: number;
  statusVerbosity: 'minimal' | 'normal' | 'debug';
  safeModeProfile: 'strict' | 'balanced' | 'power';
}

export interface TelegramSettings {
  enabled: boolean;
  botToken: string;
  chatId?: string;
  apiRoot?: string;
  forceIPv4: boolean;
}

export interface TelecodeSettings {
  agent: AgentSettings;
  telegram: TelegramSettings;
  whatsapp: WhatsAppSettings;
}

export interface WhatsAppSettings {
  enabled: boolean;
  sessionPath: string;
  allowSelfCommands: boolean;
  accessMode: 'self' | 'allowlist' | 'all';
  allowedPhones: string[];
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

export function resolveUiLanguage(uiLanguage: 'ru' | 'en' | 'auto'): 'ru' | 'en' {
  if (uiLanguage === 'auto') {
    const vscLang = vscode.env.language.toLowerCase();
    return (vscLang === 'ru' || vscLang.startsWith('ru-')) ? 'ru' : 'en';
  }
  return uiLanguage;
}

export function readTelecodeSettings(): TelecodeSettings {
  const config = vscode.workspace.getConfiguration('telecode');

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

  const languageRaw = config.get<string>('language') || 'auto';
  const language = (languageRaw === 'ru' || languageRaw === 'en' || languageRaw === 'auto') ? languageRaw : 'auto';

  const uiLanguageRaw = config.get<string>('uiLanguage') || 'auto';
  const uiLanguage = (uiLanguageRaw === 'ru' || uiLanguageRaw === 'en' || uiLanguageRaw === 'auto') ? uiLanguageRaw : 'auto';

  const allowOutOfWorkspace = config.get<boolean>('allowOutOfWorkspace', false) === true;
  const logMaxChars = readPositiveNumber(config.get<number>('logMaxChars'), 500_000);
  const legacyChannelLogLines = config.get<number>('telegramMaxLogLines');
  const channelLogLines = readPositiveNumber(
    config.get<number>('channelLogLines'),
    readPositiveNumber(legacyChannelLogLines, 300),
  );
  const statusVerbosityRaw = (config.get<string>('statusVerbosity') || 'normal').trim();
  const statusVerbosity =
    statusVerbosityRaw === 'minimal' || statusVerbosityRaw === 'normal' || statusVerbosityRaw === 'debug'
      ? statusVerbosityRaw
      : 'normal';
  const safeModeProfileRaw = (config.get<string>('safeModeProfile') || 'balanced').trim();
  const safeModeProfile =
    safeModeProfileRaw === 'strict' || safeModeProfileRaw === 'balanced' || safeModeProfileRaw === 'power'
      ? safeModeProfileRaw
      : 'balanced';

  const telegramEnabled = config.get<boolean>('telegram.enabled') === true;
  const telegramBotToken = (config.get<string>('telegram.botToken') || '').trim();
  const telegramChatIdRaw = (config.get<string>('telegram.chatId') || '').trim();
  const telegramApiRootRaw = (config.get<string>('telegram.apiRoot') || '').trim();
  const telegramForceIPv4 = config.get<boolean>('telegram.forceIPv4', true) !== false;
  const whatsappEnabled = config.get<boolean>('whatsapp.enabled') === true;
  const whatsappSessionPath = (config.get<string>('whatsapp.sessionPath') || '~/.telecode-ai/whatsapp-session.json').trim();
  const whatsappAllowSelfCommands = config.get<boolean>('whatsapp.allowSelfCommands', true) !== false;
  const whatsappAccessModeRaw = (config.get<string>('whatsapp.accessMode') || 'self').trim().toLowerCase();
  const whatsappAccessMode =
    whatsappAccessModeRaw === 'self' || whatsappAccessModeRaw === 'allowlist' || whatsappAccessModeRaw === 'all'
      ? whatsappAccessModeRaw
      : 'self';
  const whatsappAllowedPhonesRaw = (config.get<string>('whatsapp.allowedPhones') || '').trim();
  const whatsappAllowedPhones = whatsappAllowedPhonesRaw
    .split(',')
    .map((item) => item.replace(/[^\d+]/g, '').replace(/^\+/, '').trim())
    .filter((item) => item.length >= 7 && item.length <= 15);

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
      uiLanguage,
      allowOutOfWorkspace,
      logMaxChars,
      channelLogLines,
      statusVerbosity,
      safeModeProfile,
    },
    telegram: {
      enabled: telegramEnabled,
      botToken: telegramBotToken,
      chatId: telegramChatIdRaw.length > 0 ? telegramChatIdRaw : undefined,
      apiRoot: telegramApiRootRaw.length > 0 ? telegramApiRootRaw : undefined,
      forceIPv4: telegramForceIPv4,
    },
    whatsapp: {
      enabled: whatsappEnabled,
      sessionPath: whatsappSessionPath,
      allowSelfCommands: whatsappAllowSelfCommands,
      accessMode: whatsappAccessMode,
      allowedPhones: whatsappAllowedPhones,
    },
  };
}
