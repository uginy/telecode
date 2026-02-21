import * as vscode from 'vscode';

export type ChatViewCommand =
  | { command: 'startAgent' }
  | { command: 'stopAgent' }
  | { command: 'runTask'; prompt: string }
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
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private webview?: vscode.Webview;
  private status = 'Idle';
  private output = 'Ready. Start the agent and run a task.';

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
    this.post({ type: 'replaceOutput', text: this.output });

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
          },
        });
      }
    });
  }

  focus(): Thenable<void> {
    return vscode.commands.executeCommand('aisCode.chatView.focus');
  }

  setStatus(status: string): void {
    this.status = status;
    this.post({ type: 'status', text: status });
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
    this.post({ type: 'settings', settings });
  }

  notify(message: string): void {
    this.post({ type: 'notify', text: message });
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
  <title>AIS Code</title>
  <style>
    :root {
      color-scheme: light dark;
      --accent: #2f8bfd;
      --panel: rgba(127, 127, 127, 0.08);
      --border: rgba(127, 127, 127, 0.24);
    }

    body {
      margin: 0;
      padding: 14px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }

    .status {
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--border);
      font-size: 11px;
      background: var(--panel);
    }

    .controls {
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
    }

    button {
      border: 1px solid transparent;
      border-radius: 8px;
      background: var(--accent);
      color: #fff;
      cursor: pointer;
      font-size: 12px;
      padding: 7px 10px;
    }

    button.secondary {
      background: transparent;
      color: var(--vscode-foreground);
      border-color: var(--border);
    }

    textarea {
      width: 100%;
      resize: vertical;
      min-height: 72px;
      box-sizing: border-box;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--panel);
      color: inherit;
      padding: 10px;
      font: inherit;
      margin-bottom: 8px;
    }

    .send {
      width: 100%;
      margin-bottom: 12px;
    }

    details {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      margin-bottom: 12px;
      overflow: hidden;
    }

    summary {
      cursor: pointer;
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 600;
      user-select: none;
    }

    .settings {
      border-top: 1px solid var(--border);
      padding: 10px;
      display: grid;
      gap: 8px;
      grid-template-columns: 1fr 1fr;
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
      border: 1px solid var(--border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      min-height: 28px;
      padding: 4px 8px;
      font: inherit;
      font-size: 12px;
    }

    .field.checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .settings-actions {
      grid-column: 1 / -1;
      display: flex;
      gap: 8px;
    }

    pre {
      margin: 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      background: var(--panel);
      min-height: 220px;
      max-height: 48vh;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--vscode-editor-font-family, ui-monospace, monospace);
      font-size: 12px;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="title">AIS Code</h1>
    <span id="status" class="status">Idle</span>
  </div>

  <div class="controls">
    <button id="startBtn" type="button">Start Agent</button>
    <button id="stopBtn" type="button" class="secondary">Stop</button>
  </div>

  <textarea id="prompt" placeholder="Describe the coding task..."></textarea>
  <button id="runBtn" type="button" class="send">Run Task</button>

  <details>
    <summary>Settings</summary>
    <div class="settings">
      <div class="field">
        <label for="engine">Engine</label>
        <select id="engine">
          <option value="auto">auto</option>
          <option value="nanoclaw">nanoclaw</option>
          <option value="pi">pi</option>
        </select>
      </div>
      <div class="field">
        <label for="provider">Provider</label>
        <input id="provider" type="text" />
      </div>
      <div class="field">
        <label for="model">Model</label>
        <input id="model" type="text" />
      </div>
      <div class="field">
        <label for="maxSteps">Max Steps</label>
        <input id="maxSteps" type="number" min="1" max="1000" />
      </div>
      <div class="field full">
        <label for="apiKey">API Key</label>
        <input id="apiKey" type="password" />
      </div>
      <div class="field full">
        <label for="baseUrl">Base URL</label>
        <input id="baseUrl" type="text" />
      </div>
      <div class="field checkbox full">
        <input id="telegramEnabled" type="checkbox" />
        <label for="telegramEnabled">Enable Telegram Bot</label>
      </div>
      <div class="field full">
        <label for="telegramBotToken">Telegram Bot Token</label>
        <input id="telegramBotToken" type="password" />
      </div>
      <div class="field full">
        <label for="telegramChatId">Telegram Chat ID</label>
        <input id="telegramChatId" type="text" />
      </div>
      <div class="settings-actions">
        <button id="saveSettingsBtn" type="button">Save Settings</button>
      </div>
    </div>
  </details>

  <pre id="output"></pre>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const statusEl = document.getElementById('status');
    const outputEl = document.getElementById('output');
    const promptEl = document.getElementById('prompt');
    const startBtnEl = document.getElementById('startBtn');
    const stopBtnEl = document.getElementById('stopBtn');
    const runBtnEl = document.getElementById('runBtn');
    const engineEl = document.getElementById('engine');
    const providerEl = document.getElementById('provider');
    const modelEl = document.getElementById('model');
    const apiKeyEl = document.getElementById('apiKey');
    const baseUrlEl = document.getElementById('baseUrl');
    const maxStepsEl = document.getElementById('maxSteps');
    const telegramEnabledEl = document.getElementById('telegramEnabled');
    const telegramBotTokenEl = document.getElementById('telegramBotToken');
    const telegramChatIdEl = document.getElementById('telegramChatId');

    const appendOutput = (text) => {
      outputEl.textContent += text;
      outputEl.scrollTop = outputEl.scrollHeight;
      vscode.setState({ output: outputEl.textContent, prompt: promptEl.value, status: statusEl.textContent });
    };

    document.getElementById('startBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'startAgent' });
    });

    document.getElementById('stopBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'stopAgent' });
    });

    const runTask = () => {
      const prompt = promptEl.value.trim();
      if (!prompt) {
        return;
      }
      vscode.postMessage({ command: 'runTask', prompt });
    };

    document.getElementById('runBtn').addEventListener('click', runTask);
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
        },
      });
    });

    promptEl.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        runTask();
      }
    });

    window.addEventListener('message', (event) => {
      const message = event.data;

      if (message.type === 'status') {
        statusEl.textContent = message.text;
        applyControlState();
      }

      if (message.type === 'replaceOutput') {
        outputEl.textContent = message.text;
        outputEl.scrollTop = outputEl.scrollHeight;
      }

      if (message.type === 'appendOutput') {
        appendOutput(message.text);
      }

      if (message.type === 'clearOutput') {
        outputEl.textContent = '';
      }

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
      }

      if (message.type === 'notify' && typeof message.text === 'string') {
        appendOutput('\\n[settings] ' + message.text + '\\n');
      }

      vscode.setState({ output: outputEl.textContent, prompt: promptEl.value, status: statusEl.textContent });
    });

    const state = vscode.getState();
    if (state) {
      if (typeof state.output === 'string') {
        outputEl.textContent = state.output;
      }
      if (typeof state.prompt === 'string') {
        promptEl.value = state.prompt;
      }
      if (typeof state.status === 'string') {
        statusEl.textContent = state.status;
      }
    }

    applyControlState();
    vscode.postMessage({ command: 'requestSettings' });
  </script>
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
    const applyControlState = () => {
      const status = (statusEl.textContent || '').toLowerCase();
      const isRunning = status === 'running';
      const isReady = status === 'ready';

      startBtnEl.textContent = isReady ? 'Agent Ready' : 'Start Agent';
      startBtnEl.disabled = isRunning || isReady;
      stopBtnEl.disabled = !isRunning && status !== 'ready';
      runBtnEl.disabled = isRunning;
    };
