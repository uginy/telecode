import * as vscode from "vscode";
import * as path from "node:path";
import { ChannelRegistry } from "./channels/channelRegistry";
import { createEnabledChannels } from "./channels/factory";
import {
	providerRequiresApiKey,
	readTelecodeSettings,
} from "./config/settings";
import type { TaskRunner } from "./agent/taskRunner";
import { createTaskRunner, buildRuntimeConfig, createRuntimeSignature } from "./agent/runtimeSession";
import type { RuntimeConfig, RuntimeEvent } from "./engine/types";
import { resolveAgentTools } from "./agent/runtimePolicy";
import {
	type ChatViewCommand,
	type ChatViewSettings,
	ChatViewProvider,
} from "./ui/chatViewProvider";
import { CodingAgent } from "./agent/codingAgent";
import { getPrimaryWorkspaceRoot, saveOpenSettingsFiles } from "./utils/vscodeUtils";
import {
	notifySettingsViews,
	persistChatViewSettings,
	syncBuildInfoToChatView,
	syncSettingsToChatView,
} from "./extension/settingsController";
import { installLlmFetchLogger } from "./extension/fetchLogger";
import { UiStatusController, isBusyStatus } from "./extension/uiStatusController";

let taskRunner: TaskRunner | null = null;
let chatProvider: ChatViewProvider | null = null;
const uiStatus = new UiStatusController(() => chatProvider);
const channelRegistry = new ChannelRegistry((message) =>
	uiStatus.appendLogLine(message),
);
let sessionApiKey = "";
let runningConfigSignature = "";
let channelsRefreshTimer: NodeJS.Timeout | null = null;
let configApplyTimer: NodeJS.Timeout | null = null;
let pendingChannelsRefresh = false;
let pendingSettingsSync = false;
let pendingRuntimeRestart = false;
let autoReloadTimer: NodeJS.Timeout | null = null;
let isReloadInProgress = false;
let devReloadArmedAt = 0;
let uiRefreshTimer: NodeJS.Timeout | null = null;
let restoreFetchLogger: (() => void) | null = null;
let extensionVersion = "0.0.0";

const CHANNEL_CONFIG_KEYS = ["telecode.telegram", "telecode.whatsapp"] as const;
const RUNTIME_RESTART_CONFIG_KEYS = [
	"telecode.provider",
	"telecode.model",
	"telecode.apiKey",
	"telecode.baseUrl",
	"telecode.maxSteps",
	"telecode.logMaxChars",
	"telecode.channelLogLines",
	"telecode.telegramMaxLogLines",
	"telecode.statusVerbosity",
	"telecode.safeModeProfile",
	"telecode.allowedTools",
	"telecode.responseStyle",
	"telecode.language",
	"telecode.allowOutOfWorkspace",
] as const;

function affectsAnyConfiguration(
	event: vscode.ConfigurationChangeEvent,
	keys: readonly string[],
): boolean {
	return keys.some((key) => event.affectsConfiguration(key));
}

export function activate(context: vscode.ExtensionContext): void {
	extensionVersion =
		context.extension?.packageJSON &&
		typeof context.extension.packageJSON.version === "string"
			? context.extension.packageJSON.version
			: "0.0.0";
	restoreFetchLogger = installLlmFetchLogger((line) => uiStatus.appendLogLine(line));
	chatProvider = new ChatViewProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"telecode.chatView",
			chatProvider,
		),
		chatProvider.onCommand((command) => {
			void handleChatViewCommand(command);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("telecode.openChat", () =>
			chatProvider?.focus(),
		),
		vscode.commands.registerCommand("telecode.openSettings", () => {
			void chatProvider?.focus();
			chatProvider?.openSettingsTab();
		}),
		vscode.commands.registerCommand("telecode.startAgent", async () => {
			await startAgent(false);
		}),
		vscode.commands.registerCommand("telecode.runTask", async () => {
			const task = await vscode.window.showInputBox({
				prompt: "What should TeleCode AI do?",
				placeHolder: "e.g. refactor src/extension.ts and add tests",
				ignoreFocusOut: true,
			});

			if (task?.trim()) {
				await runTask(task);
			}
		}),
		vscode.commands.registerCommand("telecode.stopAgent", () => {
			stopAgent(true);
		}),
		vscode.commands.registerCommand("telecode.resetSession", () => {
			taskRunner?.clearHistorySync();
			vscode.window.showInformationMessage(
				"TeleCode AI: Session history cleared.",
			);
		}),
		vscode.commands.registerCommand("telecode.setStyleShort", async () => {
			await saveOpenSettingsFiles();
			await vscode.workspace
				.getConfiguration("telecode")
				.update("responseStyle", "concise", true);
			vscode.window.showInformationMessage(
				"TeleCode AI: Concise response style set.",
			);
		}),
		vscode.commands.registerCommand("telecode.setStyleNormal", async () => {
			await saveOpenSettingsFiles();
			await vscode.workspace
				.getConfiguration("telecode")
				.update("responseStyle", "normal", true);
			vscode.window.showInformationMessage(
				"TeleCode AI: Normal response style set.",
			);
		}),
		vscode.commands.registerCommand("telecode.setStyleDetailed", async () => {
			await saveOpenSettingsFiles();
			await vscode.workspace
				.getConfiguration("telecode")
				.update("responseStyle", "detailed", true);
			vscode.window.showInformationMessage(
				"TeleCode AI: Detailed response style set.",
			);
		}),
		vscode.commands.registerCommand("telecode.setLanguageRu", async () => {
			await saveOpenSettingsFiles();
			await vscode.workspace
				.getConfiguration("telecode")
				.update("language", "ru", true);
			vscode.window.showInformationMessage(
				"TeleCode AI: Agent language has been set to Russian.",
			);
		}),
		vscode.commands.registerCommand("telecode.setLanguageEn", async () => {
			await saveOpenSettingsFiles();
			await vscode.workspace
				.getConfiguration("telecode")
				.update("language", "en", true);
			vscode.window.showInformationMessage(
				"TeleCode AI: Agent language has been set to English.",
			);
		}),
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration("telecode")) {
				pendingSettingsSync = true;

				if (affectsAnyConfiguration(event, CHANNEL_CONFIG_KEYS)) {
					pendingChannelsRefresh = true;
				}

				if (
					taskRunner?.runtime &&
					affectsAnyConfiguration(event, RUNTIME_RESTART_CONFIG_KEYS)
				) {
					pendingRuntimeRestart = true;
				}

				scheduleConfigApply();
			}
		}),
	);

	refreshChannels();
	setupPromptStackWatcher(context);
	syncSettingsToChatView(chatProvider);
	syncBuildInfoToChatView(chatProvider, {
		extensionVersion,
		bundleFilePath: __filename,
	});
	uiStatus.setLocalStatus("Idle");
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
	if (uiRefreshTimer) {
		clearTimeout(uiRefreshTimer);
		uiRefreshTimer = null;
	}
	restoreFetchLogger?.();
	restoreFetchLogger = null;
	uiStatus.dispose();
	channelRegistry.stopAll();
}

async function handleChatViewCommand(command: ChatViewCommand): Promise<void> {
	if (command.command === "startAgent") {
		await startAgent(false);
		return;
	}

	if (command.command === "stopAgent") {
		stopAgent(true);
		return;
	}
	if (command.command === "connectChannels") {
		connectChannels(true);
		return;
	}
	if (command.command === "disconnectChannels") {
		disconnectChannels(true);
		return;
	}

	if (command.command === "runTask") {
		await runTask(command.prompt);
		return;
	}

	if (command.command === "openSettings") {
		void chatProvider?.focus();
		chatProvider?.openSettingsTab();
		return;
	}

	if (command.command === "requestSettings") {
		syncSettingsToChatView(chatProvider);
		return;
	}

	if (command.command === "saveSettings") {
		await saveSettingsFromChatView(command.settings);
		return;
	}

	if (command.command === "fetchModels") {
		const models = await CodingAgent.fetchModelsFromApi(
			command.provider,
			command.baseUrl,
			command.apiKey,
		);
		if (models.length > 0) {
			chatProvider?.setModels(models);
		}
		return;
	}
}

async function startAgent(forceRestart: boolean): Promise<boolean> {
	const settings = readTelecodeSettings();
	const { policy, tools } = resolveAgentTools(settings.agent);

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
			vscode.window.showErrorMessage(
				"TeleCode AI: API key is required to start the agent.",
			);
			return false;
		}

		sessionApiKey = enteredApiKey.trim();
		apiKey = sessionApiKey;

		try {
			await saveOpenSettingsFiles();
			await vscode.workspace
				.getConfiguration("telecode")
				.update("apiKey", apiKey, vscode.ConfigurationTarget.Global);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			uiStatus.appendLogLine(`[settings:warn] Failed to persist API key: ${message}`);
		}
	}

	const config: RuntimeConfig = {
		...buildRuntimeConfig(settings.agent, {
			cwd: getPrimaryWorkspaceRoot(),
			allowedTools: policy.allowedTools,
			allowOutOfWorkspace: policy.allowOutOfWorkspace,
		}),
		apiKey,
	};

	const signature = createRuntimeSignature(config, tools);
	if (
		!forceRestart &&
		taskRunner?.runtime &&
		runningConfigSignature === signature
	) {
		refreshChannels();
		uiStatus.setLocalStatus("Ready");
		return true;
	}

	if (taskRunner?.runtime) {
		taskRunner.abortCurrentRun();
		runningConfigSignature = "";
	}

	try {
		if (!taskRunner) {
			taskRunner = createTaskRunner({
				onEvent: handleRuntimeEvent,
				onStateChange: (state) => {
					if (state === "error" && !isBusyStatus(uiStatus.getActiveStatus())) {
						uiStatus.setLocalStatus("Error");
					} else if (state === "idle" || state === "stopped") {
						uiStatus.setLocalStatus("Idle");
					}
				},
				watchdogTimeoutMs: 180_000,
				workspaceRoot: getPrimaryWorkspaceRoot(),
			});
		}

		const runtime = taskRunner.initRuntime(config, tools);
		runningConfigSignature = signature;

		uiStatus.appendLogLine(`[agent] Started with ${config.provider}/${config.model}`);
		const resolvedModel = runtime.getModelInfo?.();
		if (resolvedModel) {
			uiStatus.appendLogLine(
				`[agent:model] api=${resolvedModel.api} provider=${resolvedModel.provider} model=${resolvedModel.id} baseUrl=${resolvedModel.baseUrl}`,
			);
		}
		const promptInfo = runtime.getPromptInfo?.();
		if (promptInfo) {
			uiStatus.appendLogLine(
				`[agent:prompt] source=${promptInfo.source} layers=${promptInfo.layerCount} signature=${promptInfo.signature}`,
			);
			if (promptInfo.missing.length > 0) {
				uiStatus.appendLogLine(`[agent:prompt] missing=${promptInfo.missing.join(",")}`);
			}
		}
		refreshChannels();
		uiStatus.setLocalStatus("Ready");
		uiStatus.appendLogLine("[system] TeleCode started (agent + enabled channels)");
		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		vscode.window.showErrorMessage(
			`TeleCode AI: failed to start agent - ${message}`,
		);
		uiStatus.appendLogLine(`[agent:error] ${message}`);
		uiStatus.setLocalStatus("Error");
		return false;
	}
}

async function runTask(task: string): Promise<void> {
	const prompt = task.trim();
	if (prompt.length === 0) {
		return;
	}

	const started = await startAgent(false);
	const runtime = taskRunner?.runtime;
	if (!started || !runtime) {
		return;
	}
	const settings = readTelecodeSettings();
	const preview = prompt.length > 240 ? `${prompt.slice(0, 240)}...` : prompt;

	uiStatus.appendLogLine(
		`[request] provider=${settings.agent.provider} model=${
			settings.agent.model
		} baseUrl=${settings.agent.baseUrl || "(default)"}`,
	);
	uiStatus.appendLogLine(`[request] prompt="${preview}"`);
	const resolvedModel = runtime.getModelInfo?.();
	if (resolvedModel) {
		uiStatus.appendLogLine(
			`[request:model] api=${resolvedModel.api} provider=${resolvedModel.provider} model=${resolvedModel.id} baseUrl=${resolvedModel.baseUrl}`,
		);
	}
	uiStatus.appendLogLine(`[user] ${prompt}`);
	uiStatus.setLocalStatus("Running");

	try {
		await taskRunner?.runTask(prompt);
		uiStatus.setLocalStatus("Ready");
		uiStatus.appendLogLine("[run] done");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		uiStatus.appendLogLine(`[run:error] ${message}`);
		uiStatus.setLocalStatus("Error");
	}
}

function stopAgent(logToOutput: boolean): void {
	let stoppedSomething = false;

	if (taskRunner?.runtime) {
		taskRunner.abortCurrentRun();
		stoppedSomething = true;
	}
	if (channelRegistry.size > 0) {
		channelRegistry.stopAll();
		uiStatus.clearChannelStatuses();
		syncChannelsStateToChatView();
		stoppedSomething = true;
	}

	if (logToOutput && stoppedSomething) {
		uiStatus.appendLogLine("[system] TeleCode stopped (agent + channels)");
	}

	if (stoppedSomething) {
		uiStatus.setLocalStatus("Stopped");
	}
}

function connectChannels(logToOutput: boolean): void {
	refreshChannels();
	if (logToOutput) {
		uiStatus.appendLogLine("[channels] Connect requested");
	}
}

function disconnectChannels(logToOutput: boolean): void {
	if (channelRegistry.size > 0) {
		channelRegistry.stopAll();
		uiStatus.clearChannelStatuses();
		syncChannelsStateToChatView();
		if (logToOutput) {
			uiStatus.appendLogLine("[channels] Disconnected");
		}
	} else if (logToOutput) {
		uiStatus.appendLogLine("[channels] Already disconnected");
	}
}

function refreshChannels(): void {
	if (channelsRefreshTimer) {
		clearTimeout(channelsRefreshTimer);
		channelsRefreshTimer = null;
	}

	channelRegistry.stopAll();
	uiStatus.clearChannelStatuses();
	syncChannelsStateToChatView();

	const settings = readTelecodeSettings();
	const { tools } = resolveAgentTools(settings.agent);
	const workspaceRoot = getPrimaryWorkspaceRoot();
	for (const channel of createEnabledChannels({
		settings,
		tools,
		workspaceRoot,
		onLog: (line) => uiStatus.appendLogLine(line),
		onStatus: (channelId, status) => {
			uiStatus.setChannelStatus(channelId, status);
			syncChannelsStateToChatView();
		},
	})) {
		channelRegistry.register(channel);
	}
	if (channelRegistry.size === 0) {
		uiStatus.appendLogLine(
			"[channels] no enabled channels (enable Telegram or WhatsApp in Settings)",
		);
	}
	channelRegistry.startAllNonBlocking();
	syncChannelsStateToChatView();
}

function syncChannelsStateToChatView(): void {
	const connected = channelRegistry.activeIds().length > 0;
	chatProvider?.setChannelsConnected(connected);
}

async function saveSettingsFromChatView(
	settings: ChatViewSettings,
): Promise<void> {
	try {
		const result = await persistChatViewSettings(settings);
		sessionApiKey = result.sessionApiKey;
		syncSettingsToChatView(chatProvider);
		notifySettingsViews(chatProvider, "saved to user settings");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		notifySettingsViews(chatProvider, `save failed: ${message}`);
		vscode.window.showErrorMessage(
			`TeleCode AI: failed to save settings - ${message}`,
		);
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
			syncSettingsToChatView(chatProvider);
		}

		if (pendingChannelsRefresh) {
			pendingChannelsRefresh = false;
			scheduleChannelsRefresh();
		}

		if (pendingRuntimeRestart) {
			pendingRuntimeRestart = false;
			uiStatus.appendLogLine(
				"[config] Settings changed. Restarting agent with latest configuration.",
			);
			void startAgent(true);
		}
	}, 300);
}

function handleRuntimeEvent(event: RuntimeEvent): void {
	uiStatus.handleRuntimeEvent(event);
}

function setupDevAutoReload(context: vscode.ExtensionContext): void {
	if (context.extensionMode !== vscode.ExtensionMode.Development) {
		return;
	}

	const config = vscode.workspace.getConfiguration("telecode");
	const enabled = config.get<boolean>("dev.autoReloadWindow", true);
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
		new vscode.RelativePattern(extRoot, "dist/extension.js"),
	);
	const onBundled = () => scheduleDevReload();
	// Arm after 1.5 s — enough for esbuild to finish its initial build on startup
	// but short enough that a quick manual save triggers reload immediately after.
	devReloadArmedAt = Date.now() + 1_500;

	watcher.onDidChange(onBundled);
	watcher.onDidCreate(onBundled);
	context.subscriptions.push(watcher);

	const uiWatcher = vscode.workspace.createFileSystemWatcher(
		new vscode.RelativePattern(extRoot, "media/*.{css,js,html}"),
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
		void vscode.commands.executeCommand("workbench.action.reloadWindow").then(
			() => {
				// Window is reloading — flag will be reset naturally when the new
				// Extension Host activates. Safety reset in case reload was rejected.
				setTimeout(() => {
					isReloadInProgress = false;
				}, 5_000);
			},
			() => {
				// Command rejected (e.g. another modal was open) — reset immediately
				// so the next file save can trigger reload again.
				isReloadInProgress = false;
			},
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
		uiStatus.appendLogLine(`[ui] refreshed (${changedFile})`);
	}, 150);
}

function setupPromptStackWatcher(context: vscode.ExtensionContext): void {
	const watcher = vscode.workspace.createFileSystemWatcher("**/prompts/*.md");
	const onPromptChanged = (uri: vscode.Uri) => {
		uiStatus.appendLogLine(`[prompt] changed: ${path.basename(uri.fsPath)}`);
		const runtime = taskRunner?.runtime;
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
