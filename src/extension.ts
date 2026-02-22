import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { ChannelRegistry } from './channels/channelRegistry';
import { TelegramChannel } from './channels/telegram';
import { providerRequiresApiKey, readAISCodeSettings } from './config/settings';
import { createRuntime } from './engine/createRuntime';
import type { AgentRuntime, RuntimeConfig } from './engine/types';
import { getPromptStackSignature } from './prompts/promptStack';
import { createWorkspaceTools, filterToolsByAllowed } from './tools/workspaceTools';
import { type ChatViewCommand, type ChatViewSettings, ChatViewProvider } from './ui/chatViewProvider';

let runtime: AgentRuntime | null = null;
let runtimeEventSubscription: (() => void) | null = null;
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
          runtime &&
          (event.affectsConfiguration('aisCode.provider') ||
            event.affectsConfiguration('aisCode.model') ||
            event.affectsConfiguration('aisCode.apiKey') ||
            event.affectsConfiguration('aisCode.baseUrl') ||
            event.affectsConfiguration('aisCode.maxSteps') ||
            event.affectsConfiguration('aisCode.allowedTools'))
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
      await vscode.workspace
        .getConfiguration('aisCode')
        .update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLogLine(`[settings:warn] Failed to persist API key: ${message}`);
    }
  }

  const config: RuntimeConfig = {
    provider: settings.agent.provider,
    model: settings.agent.model,
    apiKey,
    baseUrl: settings.agent.baseUrl,
    maxSteps: settings.agent.maxSteps,
    allowedTools: settings.agent.allowedTools,
    cwd: getPrimaryWorkspaceRoot(),
  };

  const signature = createConfigSignature(config, tools);
  if (!forceRestart && runtime && runningConfigSignature === signature) {
    setStatus('Ready');
    return true;
  }

  stopAgent(false);

  try {
    const created = createRuntime(config, tools);
    runtime = created.runtime;
    runtimeEventSubscription = subscribeToRuntimeEvents(runtime);
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
  if (!started || !runtime) {
    return;
  }
  const settings = readAISCodeSettings();
  const preview = prompt.length > 240 ? `${prompt.slice(0, 240)}...` : prompt;

  appendLogLine(
    `[request] engine=${runtime.engine} provider=${settings.agent.provider} model=${settings.agent.model} baseUrl=${settings.agent.baseUrl || '(default)'}`
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
  const heartbeat = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const staleSec = Math.floor((Date.now() - lastRuntimeEventAt) / 1000);
    appendLogLine(`[heartbeat] running ${elapsed}s • last_event=${lastRuntimeEventLabel} (${staleSec}s ago)`);
    if (staleSec >= 180 && runtime) {
      appendLogLine('[watchdog] no runtime events for 180s, aborting task');
      runtime.abort();
    }
  }, 10_000);

  try {
    await runtime.prompt(prompt);
    setStatus('Ready');
    appendLogLine('[run] done');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLogLine(`[run:error] ${message}`);
    setStatus('Error');
  } finally {
    clearInterval(heartbeat);
  }
}

function stopAgent(logToOutput: boolean): void {
  let stoppedSomething = false;

  if (runtime) {
    runtime.abort();
    runtimeEventSubscription?.();
    runtimeEventSubscription = null;
    runtime = null;
    runningConfigSignature = '';
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
    await config.update('provider', settings.provider, target);
    await config.update('model', settings.model, target);
    if (apiKey.length > 0) {
      await config.update('apiKey', apiKey, target);
      sessionApiKey = apiKey;
    }
    await config.update('baseUrl', settings.baseUrl, target);
    await config.update('maxSteps', settings.maxSteps, target);
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

function subscribeToRuntimeEvents(activeRuntime: AgentRuntime): () => void {
  return activeRuntime.onEvent((event) => {
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
  });
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
  if (message.startsWith('tools_available ')) {
    return `Инструменты загружены: ${message.replace('tools_available ', '')}`;
  }
  if (message.startsWith('prompt_stack ')) {
    return `Prompt stack: ${message.replace('prompt_stack ', '')}`;
  }
  if (message.startsWith('prompt_stack_missing ')) {
    const raw = message.replace('prompt_stack_missing ', '').trim();
    const items = raw.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
    if (items.length <= 4) {
      return `Prompt stack missing: ${items.join(', ')}`;
    }
    return `Prompt stack missing: ${items.slice(0, 3).join(', ')} (+${items.length - 3} more)`;
  }
  if (message.startsWith('llm_config ')) {
    return `LLM config: ${message.replace('llm_config ', '')}`;
  }
  if (message.startsWith('tool_execution_start:')) {
    return `Начинаю инструмент: ${message.replace('tool_execution_start:', '')}`;
  }
  if (message.startsWith('tool_execution_update:')) {
    return `Выполняю инструмент: ${message.replace('tool_execution_update:', '')}`;
  }
  if (message.startsWith('tool_execution_end:')) {
    return `Завершил инструмент: ${message.replace('tool_execution_end:', '')}`;
  }
  if (message === 'agent_start') {
    return 'Агент запущен';
  }
  if (message === 'turn_start') {
    return 'Новый шаг рассуждения';
  }
  if (message === 'message_start') {
    return 'Формирую ответ';
  }
  if (message === 'message_end') {
    return 'Ответ сформирован';
  }
  if (message === 'turn_end') {
    return 'Шаг завершен';
  }
  if (message === 'agent_end') {
    return 'Выполнение завершено';
  }
  return message;
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
