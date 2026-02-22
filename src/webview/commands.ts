import api from './vscode-api';

export type Settings = {

  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  maxSteps: number;
  responseStyle?: string;
  language?: string;
  uiLanguage?: string;
  allowOutOfWorkspace: boolean;
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  telegramApiRoot: string;
  telegramForceIPv4: boolean;
};

export const cmd = {
  startAgent:      () => api.postMessage({ command: 'startAgent' }),
  stopAgent:       () => api.postMessage({ command: 'stopAgent' }),
  runTask:         (prompt: string) => api.postMessage({ command: 'runTask', prompt }),
  requestSettings: () => api.postMessage({ command: 'requestSettings' }),
  saveSettings:    (settings: Settings) => api.postMessage({ command: 'saveSettings', settings }),
  fetchModels:     (provider: string, baseUrl: string, apiKey: string) => 
                   api.postMessage({ command: 'fetchModels', provider, baseUrl, apiKey }),
};
