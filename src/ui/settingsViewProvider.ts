import * as vscode from 'vscode';
import type { ChatViewSettings } from './chatViewProvider';

export type SettingsViewCommand =
  | { command: 'requestSettings' }
  | { command: 'saveSettings'; settings: ChatViewSettings };

export class SettingsViewProvider implements vscode.WebviewViewProvider {
  private webview?: vscode.Webview;
  private latestSettings?: ChatViewSettings;
  private lastNote = '';
  private readonly commandEmitter = new vscode.EventEmitter<SettingsViewCommand>();
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
    if (this.latestSettings) {
      this.post({ type: 'settings', settings: this.latestSettings });
    }
    if (this.lastNote) {
      this.post({ type: 'notify', text: this.lastNote });
    }

    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      if (!message || typeof message !== 'object') {
        return;
      }

      const payload = message as Record<string, unknown>;
      const command = payload.command;

      if (command === 'requestSettings') {
        this.commandEmitter.fire({ command: 'requestSettings' });
      }

      if (command === 'saveSettings' && payload.settings && typeof payload.settings === 'object') {
        const parsed = parseSettingsPayload(payload.settings as Record<string, unknown>);
        this.commandEmitter.fire({ command: 'saveSettings', settings: parsed });
      }
    });
  }

  focus(): Thenable<void> {
    return vscode.commands.executeCommand('aisCode.settingsView.focus');
  }

  setSettings(settings: ChatViewSettings): void {
    this.latestSettings = settings;
    this.post({ type: 'settings', settings });
  }

  notify(message: string): void {
    this.lastNote = message;
    this.post({ type: 'notify', text: message });
  }

  refresh(): void {
    if (!this.webview) {
      return;
    }
    this.webview.html = this.renderHtml(this.webview);
    if (this.latestSettings) {
      this.post({ type: 'settings', settings: this.latestSettings });
    }
    if (this.lastNote) {
      this.post({ type: 'notify', text: this.lastNote });
    }
  }

  private post(message: Record<string, unknown>): void {
    this.webview?.postMessage(message);
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = createNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
  />
  <title>AIS Code Settings</title>
  <style>
    body {
      margin: 0;
      padding: 14px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: 100vh;
      box-sizing: border-box;
    }

    h1 {
      margin: 0;
      font-size: 14px;
    }

    .settings {
      display: grid;
      gap: 8px;
      grid-template-columns: 1fr 1fr;
      overflow: auto;
      padding-right: 2px;
    }

    .field {
      display: grid;
      gap: 4px;
    }

    .field.full {
      grid-column: 1 / -1;
    }

    .field label {
      font-size: 11px;
      opacity: 0.86;
    }

    .field input,
    .field select {
      box-sizing: border-box;
      border-radius: 6px;
      border: 1px solid rgba(127, 127, 127, 0.24);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      min-height: 30px;
      padding: 5px 8px;
      font: inherit;
      font-size: 12px;
    }

    .field.checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    button {
      border: 1px solid transparent;
      border-radius: 8px;
      background: #2f8bfd;
      color: #fff;
      cursor: pointer;
      font-size: 12px;
      padding: 8px 12px;
      width: 100%;
    }

    #note {
      font-size: 11px;
      opacity: 0.88;
      min-height: 16px;
    }
  </style>
</head>
<body>
  <h1>AIS Code Settings</h1>
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
  <div id="note"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const engineEl = document.getElementById('engine');
    const providerEl = document.getElementById('provider');
    const modelEl = document.getElementById('model');
    const apiKeyEl = document.getElementById('apiKey');
    const baseUrlEl = document.getElementById('baseUrl');
    const maxStepsEl = document.getElementById('maxSteps');
    const telegramEnabledEl = document.getElementById('telegramEnabled');
    const telegramBotTokenEl = document.getElementById('telegramBotToken');
    const telegramChatIdEl = document.getElementById('telegramChatId');
    const telegramApiRootEl = document.getElementById('telegramApiRoot');
    const telegramForceIPv4El = document.getElementById('telegramForceIPv4');
    const noteEl = document.getElementById('note');

    document.getElementById('saveSettingsBtn').addEventListener('click', () => {
      const maxStepsRaw = Number.parseInt(maxStepsEl.value || '100', 10);
      const maxSteps = Number.isFinite(maxStepsRaw) && maxStepsRaw > 0 ? maxStepsRaw : 100;
      vscode.postMessage({
        command: 'saveSettings',
        settings: {
          engine: engineEl.value,
          provider: providerEl.value.trim(),
          model: modelEl.value.trim(),
          apiKey: apiKeyEl.value.trim(),
          baseUrl: baseUrlEl.value.trim(),
          maxSteps,
          telegramEnabled: telegramEnabledEl.checked,
          telegramBotToken: telegramBotTokenEl.value.trim(),
          telegramChatId: telegramChatIdEl.value.trim(),
          telegramApiRoot: telegramApiRootEl.value.trim(),
          telegramForceIPv4: telegramForceIPv4El.checked,
        },
      });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'settings' && message.settings) {
        const s = message.settings;
        engineEl.value = s.engine || 'auto';
        providerEl.value = s.provider || '';
        modelEl.value = s.model || '';
        apiKeyEl.value = s.apiKey || '';
        baseUrlEl.value = s.baseUrl || '';
        maxStepsEl.value = String(s.maxSteps || 100);
        telegramEnabledEl.checked = s.telegramEnabled === true;
        telegramBotTokenEl.value = s.telegramBotToken || '';
        telegramChatIdEl.value = s.telegramChatId || '';
        telegramApiRootEl.value = s.telegramApiRoot || '';
        telegramForceIPv4El.checked = s.telegramForceIPv4 !== false;
      }
      if (message.type === 'notify' && typeof message.text === 'string') {
        noteEl.textContent = message.text;
      }
    });

    vscode.postMessage({ command: 'requestSettings' });
  </script>
</body>
</html>`;
  }
}

function parseSettingsPayload(raw: Record<string, unknown>): ChatViewSettings {
  const engineValue = raw.engine;
  const engine: ChatViewSettings['engine'] =
    engineValue === 'nanoclaw' || engineValue === 'pi' ? engineValue : 'auto';
  const maxStepsRaw = typeof raw.maxSteps === 'number' ? raw.maxSteps : Number(raw.maxSteps);
  const maxSteps = Number.isFinite(maxStepsRaw) && maxStepsRaw > 0 ? Math.floor(maxStepsRaw) : 100;

  return {
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
  };
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
