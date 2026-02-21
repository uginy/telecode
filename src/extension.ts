import * as vscode from 'vscode';
import { type AgentTool } from '@mariozechner/pi-agent-core';
import { TelegramChannel } from './channels/telegram';
import { providerRequiresApiKey, readAISCodeSettings } from './config/settings';
import { createRuntime } from './engine/createRuntime';
import type { AgentRuntime, RuntimeConfig } from './engine/types';
import { createWorkspaceTools, filterToolsByAllowed } from './tools/workspaceTools';
import { type ChatViewCommand, type ChatViewSettings, ChatViewProvider } from './ui/chatViewProvider';

let runtime: AgentRuntime | null = null;
let runtimeEventSubscription: (() => void) | null = null;
let chatProvider: ChatViewProvider | null = null;
let telegramChannel: TelegramChannel | null = null;
let sessionApiKey = '';
let runningConfigSignature = '';
let telegramRefreshTimer: NodeJS.Timeout | null = null;
let configApplyTimer: NodeJS.Timeout | null = null;
let pendingTelegramRefresh = false;
let pendingSettingsSync = false;
let pendingRuntimeRestart = false;
let autoReloadTimer: NodeJS.Timeout | null = null;
let isReloadInProgress = false;

export function activate(context: vscode.ExtensionContext): void {
  chatProvider = new ChatViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('aisCode.chatView', chatProvider),
    chatProvider.onCommand((command) => {
      void handleChatViewCommand(command);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aisCode.openChat', () => chatProvider?.focus()),
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
          pendingTelegramRefresh = true;
        }

        if (
          runtime &&
          (event.affectsConfiguration('aisCode.engine') ||
            event.affectsConfiguration('aisCode.provider') ||
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

  refreshTelegramChannel();
  syncSettingsToChatView();
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
  if (telegramRefreshTimer) {
    clearTimeout(telegramRefreshTimer);
    telegramRefreshTimer = null;
  }
  telegramChannel?.stop();
  telegramChannel = null;
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
    const created = createRuntime(settings.agent.engine, config, tools);
    runtime = created.runtime;
    runtimeEventSubscription = subscribeToRuntimeEvents(runtime);
    runningConfigSignature = signature;

    appendOutput(`\n[agent] Started (${created.engine}) with ${config.provider}/${config.model}\n`);
    if (created.fallbackReason) {
      appendOutput(`[agent] ${created.fallbackReason}\n`);
    }
    setStatus('Ready');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`AIS Code: failed to start agent - ${message}`);
    appendOutput(`\n[agent:error] ${message}\n`);
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

  appendOutput(`\n[user] ${prompt}\n\n`);
  setStatus('Running');

  try {
    await runtime.prompt(prompt);
    setStatus('Ready');
    appendOutput('\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendOutput(`\n[run:error] ${message}\n`);
    setStatus('Error');
  }
}

function stopAgent(logToOutput: boolean): void {
  if (!runtime) {
    return;
  }

  runtime.abort();
  runtimeEventSubscription?.();
  runtimeEventSubscription = null;
  runtime = null;
  runningConfigSignature = '';

  if (logToOutput) {
    appendOutput('\n[agent] Stopped\n');
  }

  setStatus('Stopped');
}

function refreshTelegramChannel(): void {
  if (telegramRefreshTimer) {
    clearTimeout(telegramRefreshTimer);
    telegramRefreshTimer = null;
  }

  telegramChannel?.stop();
  telegramChannel = null;

  const settings = readAISCodeSettings();
  const tools = resolveTools(settings.agent.allowedTools);

  telegramChannel = new TelegramChannel(tools);
  void telegramChannel.start();
}

async function saveSettingsFromChatView(settings: ChatViewSettings): Promise<void> {
  const config = vscode.workspace.getConfiguration('aisCode');
  const target = vscode.ConfigurationTarget.Global;

  try {
    await config.update('engine', settings.engine, target);
    await config.update('provider', settings.provider, target);
    await config.update('model', settings.model, target);
    await config.update('apiKey', settings.apiKey, target);
    await config.update('baseUrl', settings.baseUrl, target);
    await config.update('maxSteps', settings.maxSteps, target);
    await config.update('telegram.enabled', settings.telegramEnabled, target);
    await config.update('telegram.botToken', settings.telegramBotToken, target);
    await config.update('telegram.chatId', settings.telegramChatId, target);

    syncSettingsToChatView();
    chatProvider?.notify('saved to user settings');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    chatProvider?.notify(`save failed: ${message}`);
    vscode.window.showErrorMessage(`AIS Code: failed to save settings - ${message}`);
    return;
  }
}

function scheduleTelegramRefresh(): void {
  if (telegramRefreshTimer) {
    clearTimeout(telegramRefreshTimer);
  }

  telegramRefreshTimer = setTimeout(() => {
    telegramRefreshTimer = null;
    refreshTelegramChannel();
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

    if (pendingTelegramRefresh) {
      pendingTelegramRefresh = false;
      scheduleTelegramRefresh();
    }

    if (pendingRuntimeRestart) {
      pendingRuntimeRestart = false;
      appendOutput('\n[config] Settings changed. Restarting agent with latest configuration.\n');
      void startAgent(true);
    }
  }, 300);
}

function resolveTools(allowedTools: string[]): AgentTool[] {
  return filterToolsByAllowed(createWorkspaceTools(), allowedTools);
}

function subscribeToRuntimeEvents(activeRuntime: AgentRuntime): () => void {
  return activeRuntime.onEvent((event) => {
    if (event.type === 'text_delta') {
      appendOutput(event.delta);
      return;
    }

    if (event.type === 'tool_start') {
      appendOutput(`\n[tool:start] ${event.toolName}\n`);
      return;
    }

    if (event.type === 'tool_end') {
      const state = event.isError ? 'error' : 'done';
      appendOutput(`\n[tool:${state}] ${event.toolName}\n`);
      return;
    }

    if (event.type === 'status') {
      appendOutput(`\n[status] ${event.message}\n`);
      return;
    }

    if (event.type === 'error') {
      appendOutput(`\n[error] ${event.message}\n`);
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
    engine: settings.agent.engine,
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl || '',
    maxSteps: config.maxSteps,
    apiKeySet: config.apiKey.length > 0,
    tools: tools.map((tool) => tool.name),
  });
}

function appendOutput(text: string): void {
  chatProvider?.appendOutput(text);
}

function setStatus(status: string): void {
  chatProvider?.setStatus(status);
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

  const watcher = vscode.workspace.createFileSystemWatcher('**/dist/extension.js');
  const onBundled = () => scheduleDevReload();

  watcher.onDidChange(onBundled);
  watcher.onDidCreate(onBundled);
  context.subscriptions.push(watcher);
}

function scheduleDevReload(): void {
  if (isReloadInProgress) {
    return;
  }

  if (autoReloadTimer) {
    clearTimeout(autoReloadTimer);
  }

  autoReloadTimer = setTimeout(() => {
    autoReloadTimer = null;
    isReloadInProgress = true;
    void vscode.commands.executeCommand('workbench.action.reloadWindow');
  }, 450);
}

function syncSettingsToChatView(): void {
  const settings = readAISCodeSettings();
  chatProvider?.setSettings({
    engine: settings.agent.engine,
    provider: settings.agent.provider,
    model: settings.agent.model,
    apiKey: settings.agent.apiKey,
    baseUrl: settings.agent.baseUrl || '',
    maxSteps: settings.agent.maxSteps,
    telegramEnabled: settings.telegram.enabled,
    telegramBotToken: settings.telegram.botToken,
    telegramChatId: settings.telegram.chatId || '',
  });
}
