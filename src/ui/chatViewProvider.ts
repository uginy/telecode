import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type ChatViewCommand =
  | { command: 'startAgent' }
  | { command: 'stopAgent' }
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
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  telegramApiRoot: string;
  telegramForceIPv4: boolean;
}

/** Maximum output buffer size in characters (~500 KB). Older text is trimmed when exceeded. */
const OUTPUT_MAX_CHARS = 500_000;
/** When the buffer exceeds the max, trim this many chars from the start. */
const OUTPUT_TRIM_CHARS = 100_000;

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private webview?: vscode.Webview;
  private status = 'Idle';
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
    return vscode.commands.executeCommand('aisCode.chatView.focus');
  }

  openSettingsTab(): void {
    this.post({ type: 'activateTab', tab: 'settings' });
  }

  setStatus(status: string): void {
    this.status = status;
    this.post({ type: 'status', text: status });
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
    this.output += text;
    if (this.output.length > OUTPUT_MAX_CHARS) {
      const trimmed = this.output.slice(OUTPUT_TRIM_CHARS);
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
    this.post({ type: 'buildInfo', text: this.buildInfo });
    this.post({ type: 'progress', text: this.progressText, busy: this.progressBusy });
    this.post({ type: 'replaceOutput', text: this.output });
    if (this.latestSettings) {
      this.post({ type: 'settings', settings: this.latestSettings });
    }
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
