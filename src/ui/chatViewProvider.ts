import * as vscode from 'vscode';

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
      box-sizing: border-box;
      height: 100vh;
      display: flex;
      flex-direction: column;
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

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0;
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

    .tabs {
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
    }

    .tab-btn {
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 11px;
      padding: 5px 10px;
      cursor: pointer;
    }

    .tab-btn.active {
      background: var(--accent);
      border-color: transparent;
      color: #fff;
    }

    .pane {
      display: none;
      min-height: 0;
    }

    .pane.active {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
    }

    .meta {
      margin-bottom: 8px;
      font-size: 11px;
      opacity: 0.8;
    }

    .progress {
      margin-bottom: 10px;
    }

    .progress-text {
      font-size: 11px;
      opacity: 0.88;
      margin-bottom: 4px;
    }

    .progress-bar {
      height: 4px;
      border-radius: 999px;
      background: var(--panel);
      border: 1px solid var(--border);
      overflow: hidden;
    }

    .progress-fill {
      width: 0;
      height: 100%;
      background: var(--accent);
      opacity: 0;
      transition: width 120ms ease, opacity 120ms ease;
    }

    .progress-fill.busy {
      width: 36%;
      opacity: 1;
      animation: progress-slide 1.2s ease-in-out infinite;
    }

    @keyframes progress-slide {
      0% { transform: translateX(-120%); }
      100% { transform: translateX(320%); }
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

    pre {
      margin: 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px;
      background: var(--panel);
      min-height: 200px;
      flex: 1 1 auto;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--vscode-editor-font-family, ui-monospace, monospace);
      font-size: 11px;
      line-height: 1.22;
    }

    #settingsNote {
      margin-top: 8px;
      font-size: 11px;
      opacity: 0.88;
      min-height: 16px;
    }
  </style>
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

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const statusEl = document.getElementById('status');
    const buildInfoEl = document.getElementById('buildInfo');
    const progressTextEl = document.getElementById('progressText');
    const progressFillEl = document.getElementById('progressFill');
    const outputEl = document.getElementById('output');
    const promptEl = document.getElementById('prompt');
    const startBtnEl = document.getElementById('startBtn');
    const stopBtnEl = document.getElementById('stopBtn');
    const runBtnEl = document.getElementById('runBtn');
    const tabLogsEl = document.getElementById('tabLogs');
    const tabSettingsEl = document.getElementById('tabSettings');
    const logsPaneEl = document.getElementById('logsPane');
    const settingsPaneEl = document.getElementById('settingsPane');
    const settingsNoteEl = document.getElementById('settingsNote');

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

    const applyControlState = () => {
      const status = (statusEl.textContent || '').toLowerCase();
      const isRunning = status.includes('running') || status.includes('thinking') || status.includes('tool ');
      const isReady = status.includes('ready');

      startBtnEl.textContent = isReady ? 'Agent Ready' : 'Start Agent';
      startBtnEl.disabled = isRunning || isReady;
      stopBtnEl.disabled = !isRunning && !isReady;
      runBtnEl.disabled = isRunning;
    };

    const appendOutput = (text) => {
      outputEl.textContent += text;
      outputEl.scrollTop = outputEl.scrollHeight;
      vscode.setState({ output: outputEl.textContent, prompt: promptEl.value, status: statusEl.textContent });
    };

    const setTab = (tab) => {
      const isLogs = tab === 'logs';
      tabLogsEl.classList.toggle('active', isLogs);
      tabSettingsEl.classList.toggle('active', !isLogs);
      logsPaneEl.classList.toggle('active', isLogs);
      settingsPaneEl.classList.toggle('active', !isLogs);
      const nextState = vscode.getState() || {};
      vscode.setState({ ...nextState, tab });
    };

    tabLogsEl.addEventListener('click', () => setTab('logs'));
    tabSettingsEl.addEventListener('click', () => setTab('settings'));

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
    promptEl.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        runTask();
      }
    });

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

      if (message.type === 'status') {
        statusEl.textContent = message.text;
        applyControlState();
      }

      if (message.type === 'buildInfo') {
        buildInfoEl.textContent = message.text || 'Last update: unknown';
      }

      if (message.type === 'progress') {
        progressTextEl.textContent = message.text || '';
        if (message.busy === true) {
          progressFillEl.classList.add('busy');
        } else {
          progressFillEl.classList.remove('busy');
        }
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

      if (message.type === 'notify' && typeof message.text === 'string') {
        appendOutput('[settings] ' + message.text + '\\n');
        settingsNoteEl.textContent = message.text;
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
        telegramApiRootEl.value = s.telegramApiRoot || '';
        telegramForceIPv4El.checked = s.telegramForceIPv4 !== false;
      }

      if (message.type === 'activateTab' && message.tab === 'settings') {
        setTab('settings');
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
      if (state.tab === 'settings') {
        setTab('settings');
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
