import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { ChannelRegistry } from './channels/channelRegistry';
import { TelegramChannel } from './channels/telegram';
import { providerRequiresApiKey, readAISCodeSettings } from './config/settings';
import { TaskRunner } from './agent/taskRunner';
import type { RuntimeConfig, RuntimeEvent } from './engine/types';
import { getPromptStackSignature } from './prompts/promptStack';
import { createWorkspaceTools, filterToolsByAllowed } from './tools';
import { type ChatViewCommand, type ChatViewSettings, ChatViewProvider } from './ui/chatViewProvider';
import { CodingAgent } from './agent/codingAgent';
import { i18n } from './services/i18n';
import { saveOpenSettingsFiles } from './utils/vscodeUtils';

let taskRunner: TaskRunner | null = null;
let chatProvider: ChatViewProvider | null = null;
const channelRegistry = new ChannelRegistry();
let sessionApiKey = '';
let runningConfigSignature = '';
let channelsRefreshTimer: NodeJS.Timeout | null = null;
let configApplyTimer: NodeJS.Timeout | null = null;
let pendingChannelsRefresh = false;
let pendingSettingsSync = false;
let pendingRuntimeRestart = false;
let autoReloadTimer: NodeJS.Timeout | null = null;
let isReloadInProgress = false;
let devReloadArmedAt = 0;
let uiRefreshTimer: NodeJS.Timeout | null = null;
let progressTimer: NodeJS.Timeout | null = null;
let statusStartedAt = 0;
let activeStatus = 'Idle';
let toolCountInRun = 0;
let lastToolStatus = '';
let lastRuntimeEventAt = 0;
let lastRuntimeEventLabel = 'none';
let restoreFetchLogger: (() => void) | null = null;

export function activate(context: vscode.ExtensionContext): void {
  installLlmFetchLogger();
  chatProvider = new ChatViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('aisCode.chatView', chatProvider),
    chatProvider.onCommand((command) => {
      void handleChatViewCommand(command);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aisCode.openChat', () => chatProvider?.focus()),
    vscode.commands.registerCommand('aisCode.openSettings', () => {
      void chatProvider?.focus();
      chatProvider?.openSettingsTab();
    }),
    vscode.commands.registerCommand('aisCode.startAgent', async () => {
      await startAgent(false);
    }),
    vscode.commands.registerCommand('aisCode.runTask', async () => {
      const task = await vscode.window.showInputBox({
        prompt: 'What should AIS Code do?',
        placeHolder: 'e.g. refactor src/extension.ts and add tests',
        ignoreFocusOut: true,
      });

      if (task?.trim()) {
        await runTask(task);
      }
    }),
    vscode.commands.registerCommand('aisCode.stopAgent', () => {
      stopAgent(true);
    }),
    vscode.commands.registerCommand('aisCode.resetSession', () => {
      taskRunner?.clearHistorySync();
      vscode.window.showInformationMessage('AIS Code: Session history cleared.');
    }),
    vscode.commands.registerCommand('aisCode.setStyleShort', async () => {
      await saveOpenSettingsFiles();
      await vscode.workspace.getConfiguration('aisCode').update('responseStyle', 'concise', true);
      vscode.window.showInformationMessage('AIS Code: Краткий стиль ответов установлен.');
    }),
    vscode.commands.registerCommand('aisCode.setStyleNormal', async () => {
      await saveOpenSettingsFiles();
      await vscode.workspace.getConfiguration('aisCode').update('responseStyle', 'normal', true);
      vscode.window.showInformationMessage('AIS Code: Обычный стиль ответов установлен.');
    }),
    vscode.commands.registerCommand('aisCode.setStyleDetailed', async () => {
      await saveOpenSettingsFiles();
      await vscode.workspace.getConfiguration('aisCode').update('responseStyle', 'detailed', true);
      vscode.window.showInformationMessage('AIS Code: Детальный стиль ответов установлен.');
    }),
    vscode.commands.registerCommand('aisCode.setLanguageRu', async () => {
      await saveOpenSettingsFiles();
      await vscode.workspace.getConfiguration('aisCode').update('language', 'ru', true);
      vscode.window.showInformationMessage('AIS Code: Язык общения установлен на русский.');
    }),
    vscode.commands.registerCommand('aisCode.setLanguageEn', async () => {
      await saveOpenSettingsFiles();
      await vscode.workspace.getConfiguration('aisCode').update('language', 'en', true);
      vscode.window.showInformationMessage('AIS Code: Agent language has been set to English.');
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('aisCode')) {
        pendingSettingsSync = true;

        if (event.affectsConfiguration('aisCode.telegram')) {
          pendingChannelsRefresh = true;
        }

        if (
          taskRunner?.getRuntime &&
          (event.affectsConfiguration('aisCode.provider') ||
            event.affectsConfiguration('aisCode.model') ||
            event.affectsConfiguration('aisCode.apiKey') ||
            event.affectsConfiguration('aisCode.baseUrl') ||
            event.affectsConfiguration('aisCode.maxSteps') ||
            event.affectsConfiguration('aisCode.allowedTools') ||
            event.affectsConfiguration('aisCode.responseStyle') ||
            event.affectsConfiguration('aisCode.language') ||
            event.affectsConfiguration('aisCode.allowOutOfWorkspace'))
        ) {
          pendingRuntimeRestart = true;
        }

        scheduleConfigApply();
      }
    })
  );

  refreshChannels();
  setupPromptStackWatcher(context);
  syncSettingsToChatView();
  syncBuildInfoToChatView();
  setStatus('Idle');
  setupDevAutoReload(context);
}

export function deactivate(): void {
  stopAgent(false);
  if (autoReloadTimer) {
    clearTimeout(autoReloadTimer);
    autoReloadTimer = null;
  }
  if (configApplyTimer) {
    clearTimeout(configApplyTimer);
    configApplyTimer = null;
  }
  if (channelsRefreshTimer) {
    clearTimeout(channelsRefreshTimer);
    channelsRefreshTimer = null;
  }
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  if (uiRefreshTimer) {
    clearTimeout(uiRefreshTimer);
    uiRefreshTimer = null;
  }
  restoreFetchLogger?.();
  restoreFetchLogger = null;
  channelRegistry.stopAll();
}

async function handleChatViewCommand(command: ChatViewCommand): Promise<void> {
  if (command.command === 'startAgent') {
    await startAgent(false);
    return;
  }

  if (command.command === 'stopAgent') {
    stopAgent(true);
    return;
  }

  if (command.command === 'runTask') {
    await runTask(command.prompt);
    return;
  }

  if (command.command === 'openSettings') {
    void chatProvider?.focus();
    chatProvider?.openSettingsTab();
    return;
  }

  if (command.command === 'requestSettings') {
    syncSettingsToChatView();
    return;
  }

  if (command.command === 'saveSettings') {
    await saveSettingsFromChatView(command.settings);
    return;
  }

  if (command.command === 'fetchModels') {
    const models = await CodingAgent.fetchModelsFromApi(command.provider, command.baseUrl, command.apiKey);
    if (models.length > 0) {
      chatProvider?.setModels(models);
    }
    return;
  }
}

async function startAgent(forceRestart: boolean): Promise<boolean> {
  const settings = readAISCodeSettings();
  const tools = resolveTools(settings.agent.allowedTools);

  let apiKey = settings.agent.apiKey;
  if (!apiKey && sessionApiKey) {
    apiKey = sessionApiKey;
  }

  if (providerRequiresApiKey(settings.agent.provider) && apiKey.length === 0) {
    const enteredApiKey = await vscode.window.showInputBox({
      prompt: `Enter API key for provider "${settings.agent.provider}"`,
      password: true,
      ignoreFocusOut: true,
    });

    if (!enteredApiKey) {
      vscode.window.showErrorMessage('AIS Code: API key is required to start the agent.');
      return false;
    }

    sessionApiKey = enteredApiKey.trim();
    apiKey = sessionApiKey;

    try {
      await saveOpenSettingsFiles();
      await vscode.workspace
        .getConfiguration('aisCode')
        .update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLogLine(`[settings:warn] Failed to persist API key: ${message}`);
    }
  }

  const config: RuntimeConfig = {
    ...settings.agent,
    apiKey,
    cwd: getPrimaryWorkspaceRoot(),
    language: settings.agent.language === 'auto' ? undefined : settings.agent.language,
  };

  const signature = createConfigSignature(config, tools);
  if (!forceRestart && taskRunner?.getRuntime && runningConfigSignature === signature) {
    setStatus('Ready');
    return true;
  }

  stopAgent(false);

  try {
    if (!taskRunner) {
      taskRunner = new TaskRunner(handleRuntimeEvent, (state) => {
        if (state === 'error' && !isBusyStatus(activeStatus)) {
          setStatus('Error');
        } else if (state === 'idle' || state === 'stopped') {
          setStatus('Idle');
        }
      }, 180_000, getPrimaryWorkspaceRoot());
    }

    const runtime = taskRunner.initRuntime(config, tools);
    runningConfigSignature = signature;

    appendLogLine(`[agent] Started with ${config.provider}/${config.model}`);
    const resolvedModel = runtime.getModelInfo?.();
    if (resolvedModel) {
      appendLogLine(
        `[agent:model] api=${resolvedModel.api} provider=${resolvedModel.provider} model=${resolvedModel.id} baseUrl=${resolvedModel.baseUrl}`
      );
    }
    const promptInfo = runtime.getPromptInfo?.();
    if (promptInfo) {
      appendLogLine(
        `[agent:prompt] source=${promptInfo.source} layers=${promptInfo.layerCount} signature=${promptInfo.signature}`
      );
      if (promptInfo.missing.length > 0) {
        appendLogLine(`[agent:prompt] missing=${promptInfo.missing.join(',')}`);
      }
    }
    setStatus('Ready');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`AIS Code: failed to start agent - ${message}`);
    appendLogLine(`[agent:error] ${message}`);
    setStatus('Error');
    return false;
  }
}

async function runTask(task: string): Promise<void> {
  const prompt = task.trim();
  if (prompt.length === 0) {
    return;
  }

  const started = await startAgent(false);
  const runtime = taskRunner?.getRuntime;
  if (!started || !runtime) {
    return;
  }
  const settings = readAISCodeSettings();
  const preview = prompt.length > 240 ? `${prompt.slice(0, 240)}...` : prompt;

  appendLogLine(
    `[request] provider=${settings.agent.provider} model=${settings.agent.model} baseUrl=${settings.agent.baseUrl || '(default)'}`
  );
  appendLogLine(`[request] prompt="${preview}"`);
  const resolvedModel = runtime.getModelInfo?.();
  if (resolvedModel) {
    appendLogLine(
      `[request:model] api=${resolvedModel.api} provider=${resolvedModel.provider} model=${resolvedModel.id} baseUrl=${resolvedModel.baseUrl}`
    );
  }
  appendLogLine(`[user] ${prompt}`);
  setStatus('Running');
  const startedAt = Date.now();
  lastRuntimeEventAt = startedAt;
  lastRuntimeEventLabel = 'task_started';

  try {
    await taskRunner?.runTask(prompt);
    setStatus('Ready');
    appendLogLine('[run] done');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLogLine(`[run:error] ${message}`);
    setStatus('Error');
  }
}

function stopAgent(logToOutput: boolean): void {
  let stoppedSomething = false;

  if (taskRunner?.getRuntime) {
    taskRunner.abortCurrentRun();
    stoppedSomething = true;
  }

  channelRegistry.stopAllCurrentTasks();
  stoppedSomething = true;

  if (logToOutput && stoppedSomething) {
    appendLogLine('[agent] Stopped');
  }

  if (stoppedSomething) {
    setStatus('Stopped');
  }
}

function refreshChannels(): void {
  if (channelsRefreshTimer) {
    clearTimeout(channelsRefreshTimer);
    channelsRefreshTimer = null;
  }

  channelRegistry.stopAll();

  const settings = readAISCodeSettings();
  const tools = resolveTools(settings.agent.allowedTools);

  const telegramChannel = new TelegramChannel(
    tools,
    (line) => {
      appendLogLine(line.startsWith('[telegram]') ? line : `[telegram] ${line}`);
    },
    (status) => {
      setStatus(status);
    }
  );
  
  channelRegistry.register(telegramChannel);
  void channelRegistry.startAll();
}

async function saveSettingsFromChatView(settings: ChatViewSettings): Promise<void> {
  const config = vscode.workspace.getConfiguration('aisCode');
  const target = vscode.ConfigurationTarget.Global;
  const apiKey = settings.apiKey.trim();
  const telegramBotToken = settings.telegramBotToken.trim();

  try {
    await saveOpenSettingsFiles();

    await config.update('provider', settings.provider, target);
    await config.update('model', settings.model, target);
    if (apiKey.length > 0) {
      await config.update('apiKey', apiKey, target);
      sessionApiKey = apiKey;
    }
    await config.update('baseUrl', settings.baseUrl, target);
    await config.update('maxSteps', settings.maxSteps, target);
    await config.update('responseStyle', settings.responseStyle, target);
    await config.update('language', settings.language, target);
    await config.update('uiLanguage', settings.uiLanguage, target);
    await config.update('allowOutOfWorkspace', settings.allowOutOfWorkspace === true, target);
    await config.update('telegram.enabled', settings.telegramEnabled, target);
    if (telegramBotToken.length > 0) {
      await config.update('telegram.botToken', telegramBotToken, target);
    }
    await config.update('telegram.chatId', settings.telegramChatId, target);
    await config.update('telegram.apiRoot', settings.telegramApiRoot, target);
    await config.update('telegram.forceIPv4', settings.telegramForceIPv4, target);

    syncSettingsToChatView();
    notifySettingsViews('saved to user settings');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notifySettingsViews(`save failed: ${message}`);
    vscode.window.showErrorMessage(`AIS Code: failed to save settings - ${message}`);
    return;
  }
}

function scheduleChannelsRefresh(): void {
  if (channelsRefreshTimer) {
    clearTimeout(channelsRefreshTimer);
  }

  channelsRefreshTimer = setTimeout(() => {
    channelsRefreshTimer = null;
    refreshChannels();
  }, 250);
}

function scheduleConfigApply(): void {
  if (configApplyTimer) {
    clearTimeout(configApplyTimer);
  }

  configApplyTimer = setTimeout(() => {
    configApplyTimer = null;

    if (pendingSettingsSync) {
      pendingSettingsSync = false;
      syncSettingsToChatView();
    }

    if (pendingChannelsRefresh) {
      pendingChannelsRefresh = false;
      scheduleChannelsRefresh();
    }

    if (pendingRuntimeRestart) {
      pendingRuntimeRestart = false;
      appendLogLine('[config] Settings changed. Restarting agent with latest configuration.');
      void startAgent(true);
    }
  }, 300);
}

function resolveTools(allowedTools: string[]): AgentTool[] {
  return filterToolsByAllowed(createWorkspaceTools(), allowedTools);
}

function handleRuntimeEvent(event: RuntimeEvent): void {
  lastRuntimeEventAt = Date.now();
  lastRuntimeEventLabel = event.type === 'status' ? `status:${event.message}` : event.type;
  if (event.type === 'text_delta') {
    appendOutput(event.delta);
    return;
  }

  if (event.type === 'tool_start') {
    const details = summarizeEventDetails(event.args);
    appendLogLine(`[tool:start] ${event.toolName}${details ? ` ${details}` : ''}`);
    return;
  }

  if (event.type === 'tool_end') {
    const state = event.isError ? 'error' : 'done';
    const details = summarizeEventDetails(event.result);
    appendLogLine(`[tool:${state}] ${event.toolName}${details ? ` ${details}` : ''}`);
    return;
  }

  if (event.type === 'status') {
    appendLogLine(`[status] ${formatRuntimeStatus(event.message)}`);
    return;
  }

  if (event.type === 'error') {
    appendLogLine(`[error] ${event.message}`);
    return;
  }

  if (event.type === 'done') {
    setStatus('Ready');
  }
}

function createConfigSignature(config: RuntimeConfig, tools: AgentTool[]): string {
  const settings = readAISCodeSettings();
  return JSON.stringify({
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl || '',
    maxSteps: config.maxSteps,
    apiKeySet: config.apiKey.length > 0,
    tools: tools.map((tool) => tool.name),
    responseStyle: config.responseStyle,
    language: config.language,
    promptSignature: getPromptStackSignature(config.cwd),
  });
}

function appendOutput(text: string): void {
  chatProvider?.appendOutput(text);
}

function appendLogLine(line: string): void {
  appendOutput(`${line}\n`);
}

function setStatus(status: string): void {
  activeStatus = status;
  chatProvider?.setStatus(status);
  syncProgressState(status);
}

function getPrimaryWorkspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? folder.uri.fsPath : process.cwd();
}

function setupDevAutoReload(context: vscode.ExtensionContext): void {
  if (context.extensionMode !== vscode.ExtensionMode.Development) {
    return;
  }

  const config = vscode.workspace.getConfiguration('aisCode');
  const enabled = config.get<boolean>('dev.autoReloadWindow', true);
  if (!enabled) {
    return;
  }

  // IMPORTANT: use RelativePattern anchored to the extension's own folder.
  // A bare glob string like '**/dist/extension.js' watches relative to the
  // workspace folders open in the Development Host — which may be a completely
  // different project. That means dist/extension.js changes are never detected
  // and the window never auto-reloads.
  const extRoot = context.extensionUri;

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(extRoot, 'dist/extension.js')
  );
  const onBundled = () => scheduleDevReload();
  // Arm after 1.5 s — enough for esbuild to finish its initial build on startup
  // but short enough that a quick manual save triggers reload immediately after.
  devReloadArmedAt = Date.now() + 1_500;

  watcher.onDidChange(onBundled);
  watcher.onDidCreate(onBundled);
  context.subscriptions.push(watcher);

  const uiWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(extRoot, 'media/*.{css,js,html}')
  );
  const onUiChanged = (uri: vscode.Uri) => {
    scheduleUiRefresh(path.basename(uri.fsPath));
  };
  uiWatcher.onDidCreate(onUiChanged);
  uiWatcher.onDidChange(onUiChanged);
  uiWatcher.onDidDelete(onUiChanged);
  context.subscriptions.push(uiWatcher);
}

function scheduleDevReload(): void {
  if (Date.now() < devReloadArmedAt) {
    return;
  }

  if (isReloadInProgress) {
    return;
  }

  if (autoReloadTimer) {
    clearTimeout(autoReloadTimer);
  }

  autoReloadTimer = setTimeout(() => {
    autoReloadTimer = null;
    isReloadInProgress = true;
    void vscode.commands.executeCommand('workbench.action.reloadWindow').then(
      () => {
        // Window is reloading — flag will be reset naturally when the new
        // Extension Host activates. Safety reset in case reload was rejected.
        setTimeout(() => { isReloadInProgress = false; }, 5_000);
      },
      () => {
        // Command rejected (e.g. another modal was open) — reset immediately
        // so the next file save can trigger reload again.
        isReloadInProgress = false;
      }
    );
  }, 450);
}

function scheduleUiRefresh(changedFile: string): void {
  if (uiRefreshTimer) {
    clearTimeout(uiRefreshTimer);
  }

  uiRefreshTimer = setTimeout(() => {
    uiRefreshTimer = null;
    chatProvider?.refresh();
    appendLogLine(`[ui] refreshed (${changedFile})`);
  }, 150);
}

function syncSettingsToChatView(): void {
  const settings = readAISCodeSettings();
  const payload: ChatViewSettings = {
    provider: settings.agent.provider,
    model: settings.agent.model,
    apiKey: settings.agent.apiKey,
    baseUrl: settings.agent.baseUrl || '',
    maxSteps: settings.agent.maxSteps,
    responseStyle: settings.agent.responseStyle,
    language: settings.agent.language,
    uiLanguage: settings.agent.uiLanguage,
    allowOutOfWorkspace: settings.agent.allowOutOfWorkspace,
    telegramEnabled: settings.telegram.enabled,
    telegramBotToken: settings.telegram.botToken,
    telegramChatId: settings.telegram.chatId || '',
    telegramApiRoot: settings.telegram.apiRoot || 'https://api.telegram.org',
    telegramForceIPv4: settings.telegram.forceIPv4,
  };

  chatProvider?.setSettings(payload);
}

function syncBuildInfoToChatView(): void {
  const loadedAt = new Date().toLocaleString();
  let builtAt = 'unknown';

  try {
    const stat = fs.statSync(__filename);
    builtAt = stat.mtime.toLocaleString();
  } catch {
    // keep unknown
  }

  chatProvider?.setBuildInfo(`Last update: build ${builtAt} | loaded ${loadedAt}`);
}

function notifySettingsViews(message: string): void {
  chatProvider?.notify(message);
}

function setupPromptStackWatcher(context: vscode.ExtensionContext): void {
  const watcher = vscode.workspace.createFileSystemWatcher('**/prompts/*.md');
  const onPromptChanged = (uri: vscode.Uri) => {
    appendLogLine(`[prompt] changed: ${path.basename(uri.fsPath)}`);
    const runtime = taskRunner?.getRuntime;
  if (runtime) {
      pendingRuntimeRestart = true;
      scheduleConfigApply();
    }
  };

  watcher.onDidCreate(onPromptChanged);
  watcher.onDidChange(onPromptChanged);
  watcher.onDidDelete(onPromptChanged);
  context.subscriptions.push(watcher);
}

function installLlmFetchLogger(): void {
  if (restoreFetchLogger) {
    return;
  }

  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== 'function') {
    return;
  }

  globalThis.fetch = (async (input: unknown, init?: unknown) => {
    const { url, method } = extractRequestInfo(input, init);
    const shouldLog = shouldLogLlmRequest(url);
    let attempt = 0;
    const maxAttempts = shouldLog ? 4 : 1; 

    while (attempt < maxAttempts) {
      attempt += 1;
      const startedAt = Date.now();
      
      try {
        const response = await originalFetch(input as never, init as never);
        if (shouldLog) {
          const elapsed = Date.now() - startedAt;
          
          if (!response.ok && (response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
            const delayMs = attempt * 1500;
            appendLogLine(`[llm:retry] ${response.status} on ${method} ${safeUrlForLog(url)}, retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts})`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }
          
          appendLogLine(`[llm:res] ${response.status} ${method} ${safeUrlForLog(url)} ${elapsed}ms`);
        }
        return response;
      } catch (error) {
        if (shouldLog) {
          const elapsed = Date.now() - startedAt;
          const message = error instanceof Error ? error.message : String(error);
          
          const isNetworkError = message.includes('fetch') || message.includes('network') || message.includes('ECONNREFUSED') || message.includes('TIMEOUT');
          if (isNetworkError && attempt < maxAttempts) {
            const delayMs = attempt * 1500;
            appendLogLine(`[llm:retry] network error "${message}" on ${method} ${safeUrlForLog(url)}, retrying in ${delayMs}ms`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }
          
          appendLogLine(`[llm:error] ${method} ${safeUrlForLog(url)} ${elapsed}ms ${message}`);
        }
        throw error;
      }
    }
    throw new Error('Unreachable reach limit in fetch retry loop');
  }) as typeof fetch;

  restoreFetchLogger = () => {
    globalThis.fetch = originalFetch;
  };
}

function extractRequestInfo(input: unknown, init?: unknown): { url: string; method: string } {
  let url = '(unknown-url)';
  let method = 'GET';

  if (typeof input === 'string') {
    url = input;
  } else if (input instanceof URL) {
    url = input.toString();
  } else if (input && typeof input === 'object') {
    const requestLike = input as { url?: string; method?: string };
    if (typeof requestLike.url === 'string') {
      url = requestLike.url;
    }
    if (typeof requestLike.method === 'string' && requestLike.method.length > 0) {
      method = requestLike.method.toUpperCase();
    }
  }

  if (init && typeof init === 'object') {
    const initLike = init as { method?: string };
    if (typeof initLike.method === 'string' && initLike.method.length > 0) {
      method = initLike.method.toUpperCase();
    }
  }

  return { url, method };
}

function shouldLogLlmRequest(url: string): boolean {
  if (!url || url === '(unknown-url)') {
    return false;
  }

  const normalized = url.toLowerCase();
  if (
    normalized.includes('api.telegram.org') ||
    normalized.startsWith('vscode-webview://') ||
    normalized.startsWith('file://')
  ) {
    return false;
  }

  return (
    normalized.includes('/v1/chat/completions') ||
    normalized.includes('/v1/responses') ||
    normalized.includes('/chat/completions') ||
    normalized.includes('/responses') ||
    normalized.includes('openrouter.ai') ||
    normalized.includes('moonshot.ai') ||
    normalized.includes('deepseek.com') ||
    normalized.includes('api.openai.com') ||
    normalized.includes('anthropic.com')
  );
}

function safeUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split('?')[0];
  }
}

function isBusyStatus(status: string): boolean {
  const lower = status.trim().toLowerCase();
  return (
    lower.includes('running') ||
    lower.includes('thinking') ||
    lower.includes('tool ') ||
    lower.includes('connecting')
  );
}

function syncProgressState(status: string): void {
  const busy = isBusyStatus(status);
  if (!busy) {
    statusStartedAt = 0;
    toolCountInRun = 0;
    lastToolStatus = '';
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    chatProvider?.setProgress(status, false);
    return;
  }

  if (statusStartedAt === 0) {
    statusStartedAt = Date.now();
    toolCountInRun = 0;
    lastToolStatus = '';
  }

  const lower = status.toLowerCase();
  if (lower.includes('tool ') && status !== lastToolStatus) {
    toolCountInRun += 1;
    lastToolStatus = status;
  }

  publishProgress();

  if (!progressTimer) {
    progressTimer = setInterval(() => {
      publishProgress();
    }, 1000);
  }
}

function publishProgress(): void {
  if (statusStartedAt === 0) {
    chatProvider?.setProgress(activeStatus, false);
    return;
  }

  const elapsedSec = Math.max(0, Math.floor((Date.now() - statusStartedAt) / 1000));
  const maxSteps = readAISCodeSettings().agent.maxSteps;
  const toolsPart = toolCountInRun > 0 ? ` • tools ${toolCountInRun}/${maxSteps}` : '';
  chatProvider?.setProgress(`${activeStatus} • ${elapsedSec}s${toolsPart}`, true);
}

function formatRuntimeStatus(message: string): string {
  const settings = readAISCodeSettings();
  i18n.setLanguage(settings.agent.language);
  return i18n.formatStatus(message);
}

function summarizeEventDetails(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return '';
  }

  const record = value as Record<string, unknown>;
  const details: string[] = [];
  pushDetail(details, 'path', record.path);
  pushDetail(details, 'query', record.query);
  pushDetail(details, 'pattern', record.pattern);
  pushDetail(details, 'command', record.command);
  pushDetail(details, 'cwd', record.cwd);
  pushDetail(details, 'count', record.count);
  pushDetail(details, 'bytes', record.bytes);
  if (details.length === 0 && 'details' in record && record.details && typeof record.details === 'object') {
    const nested = record.details as Record<string, unknown>;
    pushDetail(details, 'path', nested.path);
    pushDetail(details, 'count', nested.count);
    pushDetail(details, 'bytes', nested.bytes);
    pushDetail(details, 'cwd', nested.cwd);
  }
  return details.join(' ');
}

function pushDetail(target: string[], key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return;
  }
  const compact = normalized.length > 64 ? `${normalized.slice(0, 61)}...` : normalized;
  target.push(`${key}=${compact}`);
}
