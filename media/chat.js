// @ts-nocheck — this file runs inside the VS Code Webview (browser context)
/* global acquireVsCodeApi */

const vscode = acquireVsCodeApi();

const statusEl        = document.getElementById('status');
const buildInfoEl     = document.getElementById('buildInfo');
const progressTextEl  = document.getElementById('progressText');
const progressFillEl  = document.getElementById('progressFill');
const outputEl        = document.getElementById('output');
const promptEl        = document.getElementById('prompt');
const startBtnEl      = document.getElementById('startBtn');
const stopBtnEl       = document.getElementById('stopBtn');
const runBtnEl        = document.getElementById('runBtn');
const tabLogsEl       = document.getElementById('tabLogs');
const tabSettingsEl   = document.getElementById('tabSettings');
const logsPaneEl      = document.getElementById('logsPane');
const settingsPaneEl  = document.getElementById('settingsPane');
const settingsNoteEl  = document.getElementById('settingsNote');

const engineEl            = document.getElementById('engine');
const providerEl          = document.getElementById('provider');
const modelEl             = document.getElementById('model');
const apiKeyEl            = document.getElementById('apiKey');
const baseUrlEl           = document.getElementById('baseUrl');
const maxStepsEl          = document.getElementById('maxSteps');
const telegramEnabledEl   = document.getElementById('telegramEnabled');
const telegramBotTokenEl  = document.getElementById('telegramBotToken');
const telegramChatIdEl    = document.getElementById('telegramChatId');
const telegramApiRootEl   = document.getElementById('telegramApiRoot');
const telegramForceIPv4El = document.getElementById('telegramForceIPv4');

const applyControlState = () => {
  const status = (statusEl.textContent || '').toLowerCase();
  const isRunning = status.includes('running') || status.includes('thinking') || status.includes('tool ');
  const isReady   = status.includes('ready');

  startBtnEl.textContent = isReady ? 'Agent Ready' : 'Start Agent';
  startBtnEl.disabled = isRunning || isReady;
  stopBtnEl.disabled  = !isRunning && !isReady;
  runBtnEl.disabled   = isRunning;
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
  if (!prompt) return;
  vscode.postMessage({ command: 'runTask', prompt });
};

document.getElementById('runBtn').addEventListener('click', runTask);
promptEl.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') runTask();
});

document.getElementById('saveSettingsBtn').addEventListener('click', () => {
  const maxStepsRaw = Number.parseInt(maxStepsEl.value || '100', 10);
  const maxSteps = Number.isFinite(maxStepsRaw) && maxStepsRaw > 0 ? maxStepsRaw : 100;
  vscode.postMessage({
    command: 'saveSettings',
    settings: {
      engine:             engineEl.value,
      provider:           providerEl.value.trim(),
      model:              modelEl.value.trim(),
      apiKey:             apiKeyEl.value.trim(),
      baseUrl:            baseUrlEl.value.trim(),
      maxSteps,
      telegramEnabled:    telegramEnabledEl.checked,
      telegramBotToken:   telegramBotTokenEl.value.trim(),
      telegramChatId:     telegramChatIdEl.value.trim(),
      telegramApiRoot:    telegramApiRootEl.value.trim(),
      telegramForceIPv4:  telegramForceIPv4El.checked,
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
    appendOutput('[settings] ' + message.text + '\n');
    settingsNoteEl.textContent = message.text;
  }

  if (message.type === 'settings' && message.settings) {
    const s = message.settings;
    engineEl.value              = s.engine || 'auto';
    providerEl.value            = s.provider || '';
    modelEl.value               = s.model || '';
    apiKeyEl.value              = s.apiKey || '';
    baseUrlEl.value             = s.baseUrl || '';
    maxStepsEl.value            = String(s.maxSteps || 100);
    telegramEnabledEl.checked   = s.telegramEnabled === true;
    telegramBotTokenEl.value    = s.telegramBotToken || '';
    telegramChatIdEl.value      = s.telegramChatId || '';
    telegramApiRootEl.value     = s.telegramApiRoot || '';
    telegramForceIPv4El.checked = s.telegramForceIPv4 !== false;
  }

  if (message.type === 'activateTab' && message.tab === 'settings') {
    setTab('settings');
  }

  vscode.setState({ output: outputEl.textContent, prompt: promptEl.value, status: statusEl.textContent });
});

// Restore state after webview soft-refresh (no Extension Host reload)
const state = vscode.getState();
if (state) {
  if (typeof state.output === 'string')  outputEl.textContent = state.output;
  if (typeof state.prompt === 'string')  promptEl.value = state.prompt;
  if (typeof state.status === 'string')  statusEl.textContent = state.status;
  if (state.tab === 'settings')          setTab('settings');
}

applyControlState();
vscode.postMessage({ command: 'requestSettings' });
