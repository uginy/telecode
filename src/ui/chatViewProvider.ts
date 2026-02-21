import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type ChatViewCommand =
  | { command: 'startAgent' }
  | { command: 'stopAgent' }
  | { command: 'runTask'; prompt: string }
  | { command: 'openSettings' }
  | { command: 'requestSettings' }
  | { command: 'saveSettings'; settings: ChatViewSettings };

export interface ChatViewSettings {
  engine: 'auto' | 'nanoclaw' | 'pi';
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
}

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

      if (command === 'saveSettings' && payload.settings && typeof payload.settings === 'object') {
        const raw = payload.settings as Record<string, unknown>;
        const engineValue = raw.engine;
        const engine: ChatViewSettings['engine'] =
          engineValue === 'nanoclaw' || engineValue === 'pi' ? engineValue : 'auto';
        const maxStepsRaw = typeof raw.maxSteps === 'number' ? raw.maxSteps : Number(raw.maxSteps);
        const maxSteps = Number.isFinite(maxStepsRaw) && maxStepsRaw > 0 ? Math.floor(maxStepsRaw) : 100;

        this.commandEmitter.fire({
          command: 'saveSettings',
          settings: {
            engine,
            provider: typeof raw.provider === 'string' ? raw.provider : '',
            model: typeof raw.model === 'string' ? raw.model : '',
            apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
            baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : '',
            maxSteps,
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

  private renderHtml(webview: vscode.Webview): string {
    const nonce = createNonce();
    const mediaPath = join(__dirname, '..', 'media');

    // Read CSS and JS fresh from disk on every call.
    // This enables soft hot-reload: changing media/chat.css or media/chat.js
    // only needs a webview refresh (chatProvider.refresh()), NOT an Extension
    // Host reload. No TypeScript compilation required.
    const css = readFileSync(join(mediaPath, 'chat.css'), 'utf8');
    const js  = readFileSync(join(mediaPath, 'chat.js'),  'utf8');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
  />
  <title>AIS Code</title>
  <style>${css}</style>
</head>
<body>
  <div class="header">
    <h1 class="title">AIS Code</h1>
    <div class="header-actions">
      <span id="status" class="status">Idle</span>
    </div>
  </div>
  <div class="tabs">
    <button id="tabLogs" class="tab-btn active" type="button">Logs</button>
    <button id="tabSettings" class="tab-btn" type="button">Settings</button>
  </div>

  <section id="logsPane" class="pane active">
    <div id="buildInfo" class="meta">Last update: unknown</div>
    <div class="progress">
      <div id="progressText" class="progress-text">Idle</div>
      <div class="progress-bar"><div id="progressFill" class="progress-fill"></div></div>
    </div>

    <div class="controls">
      <button id="startBtn" type="button">Start Agent</button>
      <button id="stopBtn" type="button" class="secondary">Stop</button>
    </div>

    <textarea id="prompt" placeholder="Describe the coding task..."></textarea>
    <button id="runBtn" type="button" class="send">Run Task</button>

    <pre id="output"></pre>
  </section>

  <section id="settingsPane" class="pane">
    <div class="settings">
      <div class="field"><label for="engine">Engine</label><select id="engine"><option value="auto">auto</option><option value="nanoclaw">nanoclaw</option><option value="pi">pi</option></select></div>
      <div class="field"><label for="provider">Provider</label><input id="provider" type="text" /></div>
      <div class="field"><label for="model">Model</label><input id="model" type="text" /></div>
      <div class="field"><label for="maxSteps">Max Steps</label><input id="maxSteps" type="number" min="1" max="1000" /></div>
      <div class="field full"><label for="apiKey">API Key</label><input id="apiKey" type="password" /></div>
      <div class="field full"><label for="baseUrl">Base URL</label><input id="baseUrl" type="text" /></div>
      <div class="field checkbox full"><input id="telegramEnabled" type="checkbox" /><label for="telegramEnabled">Enable Telegram Bot</label></div>
      <div class="field full"><label for="telegramBotToken">Telegram Bot Token</label><input id="telegramBotToken" type="password" /></div>
      <div class="field full"><label for="telegramChatId">Telegram Chat ID</label><input id="telegramChatId" type="text" /></div>
      <div class="field full"><label for="telegramApiRoot">Telegram API Root</label><input id="telegramApiRoot" type="text" /></div>
      <div class="field checkbox full"><input id="telegramForceIPv4" type="checkbox" /><label for="telegramForceIPv4">Force IPv4 (recommended)</label></div>
      <div class="field full"><button id="saveSettingsBtn" type="button">Save Settings</button></div>
    </div>
    <div id="settingsNote"></div>
  </section>

  <script nonce="${nonce}">${js}</script>
</body>
</html>`;
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
