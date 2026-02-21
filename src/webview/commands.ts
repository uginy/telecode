import api from './vscode-api';

export type Settings = {
  engine: 'auto' | 'pi';

  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  maxSteps: number;
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
};
