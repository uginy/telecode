import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CodingAgent } from '../agent/codingAgent';
import { i18n } from '../services/i18n';
import { readTelecodeSettings } from '../config/settings';

export type ChatViewCommand =
  | { command: 'startAgent' }
  | { command: 'stopAgent' }
  | { command: 'connectChannels' }
  | { command: 'disconnectChannels' }
  | { command: 'runTask'; prompt: string }
  | { command: 'openSettings' }
  | { command: 'requestSettings' }
  | { command: 'saveSettings'; settings: ChatViewSettings }
  | { command: 'fetchModels'; provider: string; baseUrl: string; apiKey: string };

export interface ChatViewSettings {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  maxSteps: number;
  responseStyle: string;
  language: string;
  uiLanguage: string;
  allowOutOfWorkspace: boolean;
  logMaxChars: number;
  telegramMaxLogLines: number;
  statusVerbosity: string;
  safeModeProfile: string;
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  telegramApiRoot: string;
  telegramForceIPv4: boolean;
}

const DEFAULT_OUTPUT_MAX_CHARS = 500_000;

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private webview?: vscode.Webview;
  private status = 'Idle';
  private channelsConnected = false;
  private buildInfo = '';
  private progressText = 'Idle';
  private progressBusy = false;
  private output = 'Ready. Start the agent and run a task.';
  private latestSettings?: ChatViewSettings;

  private readonly commandEmitter = new vscode.EventEmitter<ChatViewCommand>();
  public readonly onCommand = this.commandEmitter.event;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.webview = webviewView.webview;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.renderHtml(webviewView.webview);

    this.post({ type: 'status', text: this.status });
    this.post({ type: 'channelsState', connected: this.channelsConnected });
    this.post({ type: 'buildInfo', text: this.buildInfo });
    this.post({ type: 'progress', text: this.progressText, busy: this.progressBusy });
    this.post({ type: 'replaceOutput', text: this.output });
    if (this.latestSettings) {
      this.post({ type: 'settings', settings: this.latestSettings });
    }

    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      if (!message || typeof message !== 'object') {
        return;
      }

      const payload = message as Record<string, unknown>;
      const command = payload.command;

      if (command === 'startAgent') {
        this.commandEmitter.fire({ command: 'startAgent' });
      }

      if (command === 'stopAgent') {
        this.commandEmitter.fire({ command: 'stopAgent' });
      }
      if (command === 'connectChannels') {
        this.commandEmitter.fire({ command: 'connectChannels' });
      }
      if (command === 'disconnectChannels') {
        this.commandEmitter.fire({ command: 'disconnectChannels' });
      }

      if (command === 'runTask' && typeof payload.prompt === 'string') {
        this.commandEmitter.fire({ command: 'runTask', prompt: payload.prompt });
      }

      if (command === 'openSettings') {
        this.commandEmitter.fire({ command: 'openSettings' });
      }

      if (command === 'requestSettings') {
        this.commandEmitter.fire({ command: 'requestSettings' });
      }

      if (command === 'fetchModels') {
        this.commandEmitter.fire({
          command: 'fetchModels',
          provider: typeof payload.provider === 'string' ? payload.provider : '',
          baseUrl: typeof payload.baseUrl === 'string' ? payload.baseUrl : '',
          apiKey: typeof payload.apiKey === 'string' ? payload.apiKey : '',
        });
      }

      if (command === 'saveSettings' && payload.settings && typeof payload.settings === 'object') {
        const raw = payload.settings as Record<string, unknown>;
        const maxStepsRaw = typeof raw.maxSteps === 'number' ? raw.maxSteps : Number(raw.maxSteps);
        const maxSteps = Number.isFinite(maxStepsRaw) && maxStepsRaw > 0 ? Math.floor(maxStepsRaw) : 100;
        const logMaxCharsRaw = typeof raw.logMaxChars === 'number' ? raw.logMaxChars : Number(raw.logMaxChars);
        const logMaxChars = Number.isFinite(logMaxCharsRaw) && logMaxCharsRaw > 0 ? Math.floor(logMaxCharsRaw) : DEFAULT_OUTPUT_MAX_CHARS;
        const telegramMaxLogLinesRaw = typeof raw.telegramMaxLogLines === 'number' ? raw.telegramMaxLogLines : Number(raw.telegramMaxLogLines);
        const telegramMaxLogLines = Number.isFinite(telegramMaxLogLinesRaw) && telegramMaxLogLinesRaw > 0 ? Math.floor(telegramMaxLogLinesRaw) : 300;

        this.commandEmitter.fire({
          command: 'saveSettings',
          settings: {
            provider: typeof raw.provider === 'string' ? raw.provider : '',
            model: typeof raw.model === 'string' ? raw.model : '',
            apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
            baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : '',
            maxSteps,
            responseStyle: typeof raw.responseStyle === 'string' ? raw.responseStyle : 'concise',
            language: typeof raw.language === 'string' ? raw.language : 'ru',
            uiLanguage: typeof raw.uiLanguage === 'string' ? raw.uiLanguage : 'ru',
            allowOutOfWorkspace: raw.allowOutOfWorkspace === true,
            logMaxChars,
            telegramMaxLogLines,
            statusVerbosity: typeof raw.statusVerbosity === 'string' ? raw.statusVerbosity : 'normal',
            safeModeProfile: typeof raw.safeModeProfile === 'string' ? raw.safeModeProfile : 'balanced',
            telegramEnabled: raw.telegramEnabled === true,
            telegramBotToken: typeof raw.telegramBotToken === 'string' ? raw.telegramBotToken : '',
            telegramChatId: typeof raw.telegramChatId === 'string' ? raw.telegramChatId : '',
            telegramApiRoot: typeof raw.telegramApiRoot === 'string' ? raw.telegramApiRoot : '',
            telegramForceIPv4: raw.telegramForceIPv4 !== false,
          },
        });
      }
    });
  }

  focus(): Thenable<void> {
    return vscode.commands.executeCommand('telecode.chatView.focus');
  }

  openSettingsTab(): void {
    this.post({ type: 'activateTab', tab: 'settings' });
  }

  setStatus(status: string): void {
    this.status = status;
    this.post({ type: 'status', text: status });
  }

  setChannelsConnected(connected: boolean): void {
    this.channelsConnected = connected;
    this.post({ type: 'channelsState', connected });
  }

  setBuildInfo(info: string): void {
    this.buildInfo = info;
    this.post({ type: 'buildInfo', text: info });
  }

  setProgress(text: string, busy: boolean): void {
    this.progressText = text;
    this.progressBusy = busy;
    this.post({ type: 'progress', text, busy });
  }

  appendOutput(text: string): void {
    const settings = readTelecodeSettings();
    const maxChars = settings.agent.logMaxChars > 0 ? settings.agent.logMaxChars : DEFAULT_OUTPUT_MAX_CHARS;
    const trimChars = Math.max(1_000, Math.floor(maxChars * 0.2));

    this.output += text;
    if (this.output.length > maxChars) {
      const trimmed = this.output.slice(trimChars);
      const newlineIdx = trimmed.indexOf('\n');
      this.output = newlineIdx !== -1 ? trimmed.slice(newlineIdx + 1) : trimmed;
    }
    this.post({ type: 'appendOutput', text });
  }

  replaceOutput(text: string): void {
    this.output = text;
    this.post({ type: 'replaceOutput', text });
  }

  clearOutput(): void {
    this.output = '';
    this.post({ type: 'clearOutput' });
  }

  setSettings(settings: ChatViewSettings): void {
    this.latestSettings = settings;
    this.post({ type: 'settings', settings });
    i18n.setLanguage(settings.uiLanguage);
    this.post({ type: 'translate', translations: i18n.getTranslations() });
  }

  notify(message: string): void {
    this.post({ type: 'notify', text: message });
  }

  setModels(models: string[]): void {
    this.post({ type: 'modelList', models });
  }

  refresh(): void {
    if (!this.webview) {
      return;
    }
    this.webview.html = this.renderHtml(this.webview);
    this.post({ type: 'status', text: this.status });
    this.post({ type: 'channelsState', connected: this.channelsConnected });
    this.post({ type: 'buildInfo', text: this.buildInfo });
    this.post({ type: 'progress', text: this.progressText, busy: this.progressBusy });
    this.post({ type: 'replaceOutput', text: this.output });
    if (this.latestSettings) {
      this.post({ type: 'settings', settings: this.latestSettings });
    }
    const settings = readTelecodeSettings();
    i18n.setLanguage(settings.agent.uiLanguage);
    this.post({ type: 'translate', translations: i18n.getTranslations() });
  }

  private post(message: Record<string, unknown>): void {
    this.webview?.postMessage(message);
  }

  private renderHtml(_webview: vscode.Webview): string {
    const nonce = createNonce();
    const mediaPath = join(__dirname, '..', 'media');

    // All three assets are read fresh on every call — no Extension Host restart needed.
    // Edit media/chat.html, media/chat.css or media/chat.js and call refresh() to see changes.
    const html = readFileSync(join(mediaPath, 'chat.html'), 'utf8');
    const css  = readFileSync(join(mediaPath, 'chat.css'),  'utf8');
    const js   = readFileSync(join(mediaPath, 'chat.js'),   'utf8');

    return html
      .replaceAll('{{NONCE}}', nonce)
      .replace('{{CSS}}', css)
      .replace('{{JS}}', js);
  }

}



function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
