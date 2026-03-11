import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { ChannelRegistry } from "./channels/channelRegistry";
import { createEnabledChannels } from "./channels/factory";
import {
	providerRequiresApiKey,
	readTelecodeSettings,
	resolveUiLanguage,
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
import { i18n } from "./services/i18n";
import { getPrimaryWorkspaceRoot, saveOpenSettingsFiles } from "./utils/vscodeUtils";

let taskRunner: TaskRunner | null = null;
let chatProvider: ChatViewProvider | null = null;
const channelRegistry = new ChannelRegistry((message) =>
	appendLogLine(message),
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
let progressTimer: NodeJS.Timeout | null = null;
let statusStartedAt = 0;
let activeStatus = "Idle";
let localStatus = "Idle";
let toolCountInRun = 0;
let lastToolStatus = "";
let pendingDuplicateLogLine = "";
let pendingDuplicateLogCount = 0;
let pendingDuplicateLogStartedAt = 0;
let restoreFetchLogger: (() => void) | null = null;
let lastRenderedStatus = "";
let lastRenderedStatusAt = 0;
let extensionVersion = "0.0.0";
const channelStatuses = new Map<string, string>();

const STATUS_SUPPRESSED_PREFIXES_MINIMAL = [
	"tools_available ",
	"prompt_stack ",
	"prompt_stack_missing ",
	"llm_config ",
	"event:",
	"tool_execution_update:",
];

const STATUS_SUPPRESSED_PREFIXES_NORMAL = [
	"tools_available ",
	"prompt_stack ",
	"llm_config ",
	"tool_execution_start:",
	"tool_execution_end:",
	"agent_start",
	"turn_start",
	"message_start",
	"message_end",
	"turn_end",
	"agent_end",
] as const;

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
	installLlmFetchLogger();
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
	syncSettingsToChatView();
	syncBuildInfoToChatView();
	setLocalStatus("Idle");
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
		syncSettingsToChatView();
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
			appendLogLine(`[settings:warn] Failed to persist API key: ${message}`);
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
		setLocalStatus("Ready");
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
					if (state === "error" && !isBusyStatus(activeStatus)) {
						setLocalStatus("Error");
					} else if (state === "idle" || state === "stopped") {
						setLocalStatus("Idle");
					}
				},
				watchdogTimeoutMs: 180_000,
				workspaceRoot: getPrimaryWorkspaceRoot(),
			});
		}

		const runtime = taskRunner.initRuntime(config, tools);
		runningConfigSignature = signature;

		appendLogLine(`[agent] Started with ${config.provider}/${config.model}`);
		const resolvedModel = runtime.getModelInfo?.();
		if (resolvedModel) {
			appendLogLine(
				`[agent:model] api=${resolvedModel.api} provider=${resolvedModel.provider} model=${resolvedModel.id} baseUrl=${resolvedModel.baseUrl}`,
			);
		}
		const promptInfo = runtime.getPromptInfo?.();
		if (promptInfo) {
			appendLogLine(
				`[agent:prompt] source=${promptInfo.source} layers=${promptInfo.layerCount} signature=${promptInfo.signature}`,
			);
			if (promptInfo.missing.length > 0) {
				appendLogLine(`[agent:prompt] missing=${promptInfo.missing.join(",")}`);
			}
		}
		refreshChannels();
		setLocalStatus("Ready");
		appendLogLine("[system] TeleCode started (agent + enabled channels)");
		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		vscode.window.showErrorMessage(
			`TeleCode AI: failed to start agent - ${message}`,
		);
		appendLogLine(`[agent:error] ${message}`);
		setLocalStatus("Error");
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

	appendLogLine(
		`[request] provider=${settings.agent.provider} model=${
			settings.agent.model
		} baseUrl=${settings.agent.baseUrl || "(default)"}`,
	);
	appendLogLine(`[request] prompt="${preview}"`);
	const resolvedModel = runtime.getModelInfo?.();
	if (resolvedModel) {
		appendLogLine(
			`[request:model] api=${resolvedModel.api} provider=${resolvedModel.provider} model=${resolvedModel.id} baseUrl=${resolvedModel.baseUrl}`,
		);
	}
	appendLogLine(`[user] ${prompt}`);
	setLocalStatus("Running");

	try {
		await taskRunner?.runTask(prompt);
		setLocalStatus("Ready");
		appendLogLine("[run] done");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		appendLogLine(`[run:error] ${message}`);
		setLocalStatus("Error");
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
		clearChannelStatuses();
		syncChannelsStateToChatView();
		stoppedSomething = true;
	}

	if (logToOutput && stoppedSomething) {
		appendLogLine("[system] TeleCode stopped (agent + channels)");
	}

	if (stoppedSomething) {
		setLocalStatus("Stopped");
	}
}

function connectChannels(logToOutput: boolean): void {
	refreshChannels();
	if (logToOutput) {
		appendLogLine("[channels] Connect requested");
	}
}

function disconnectChannels(logToOutput: boolean): void {
	if (channelRegistry.size > 0) {
		channelRegistry.stopAll();
		clearChannelStatuses();
		syncChannelsStateToChatView();
		if (logToOutput) {
			appendLogLine("[channels] Disconnected");
		}
	} else if (logToOutput) {
		appendLogLine("[channels] Already disconnected");
	}
}

function refreshChannels(): void {
	if (channelsRefreshTimer) {
		clearTimeout(channelsRefreshTimer);
		channelsRefreshTimer = null;
	}

	channelRegistry.stopAll();
	clearChannelStatuses();
	syncChannelsStateToChatView();

	const settings = readTelecodeSettings();
	const { tools } = resolveAgentTools(settings.agent);
	const workspaceRoot = getPrimaryWorkspaceRoot();
	for (const channel of createEnabledChannels({
		settings,
		tools,
		workspaceRoot,
		onLog: appendLogLine,
		onStatus: (channelId, status) => {
			setChannelStatus(channelId, status);
			syncChannelsStateToChatView();
		},
	})) {
		channelRegistry.register(channel);
	}
	if (channelRegistry.size === 0) {
		appendLogLine(
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
	const config = vscode.workspace.getConfiguration("telecode");
	const target = vscode.ConfigurationTarget.Global;
	const apiKey = settings.apiKey.trim();
	const telegramBotToken = settings.telegramBotToken.trim();

	try {
		await saveOpenSettingsFiles();

		await config.update("provider", settings.provider, target);
		await config.update("model", settings.model, target);
		if (apiKey.length > 0) {
			await config.update("apiKey", apiKey, target);
			sessionApiKey = apiKey;
		}
		await config.update("baseUrl", settings.baseUrl, target);
		await config.update("maxSteps", settings.maxSteps, target);
		await config.update("logMaxChars", settings.logMaxChars, target);
		await config.update("channelLogLines", settings.channelLogLines, target);
		await config.update("statusVerbosity", settings.statusVerbosity, target);
		await config.update("safeModeProfile", settings.safeModeProfile, target);
		await config.update("responseStyle", settings.responseStyle, target);
		await config.update("language", settings.language, target);
		await config.update("uiLanguage", settings.uiLanguage, target);
		await config.update(
			"allowOutOfWorkspace",
			settings.safeModeProfile === "power",
			target,
		);
		await config.update("telegram.enabled", settings.telegramEnabled, target);
		if (telegramBotToken.length > 0) {
			await config.update("telegram.botToken", telegramBotToken, target);
		}
		await config.update("telegram.chatId", settings.telegramChatId, target);
		await config.update("telegram.apiRoot", settings.telegramApiRoot, target);
		await config.update(
			"telegram.forceIPv4",
			settings.telegramForceIPv4,
			target,
		);
		await config.update("whatsapp.enabled", settings.whatsappEnabled, target);
		await config.update(
			"whatsapp.sessionPath",
			settings.whatsappSessionPath,
			target,
		);
		await config.update(
			"whatsapp.allowSelfCommands",
			settings.whatsappAllowSelfCommands,
			target,
		);

		await config.update(
			"whatsapp.accessMode",
			settings.whatsappAccessMode,
			target,
		);
		await config.update(
			"whatsapp.allowedPhones",
			settings.whatsappAllowedPhones,
			target,
		);

		syncSettingsToChatView();
		notifySettingsViews("saved to user settings");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		notifySettingsViews(`save failed: ${message}`);
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
			syncSettingsToChatView();
		}

		if (pendingChannelsRefresh) {
			pendingChannelsRefresh = false;
			scheduleChannelsRefresh();
		}

		if (pendingRuntimeRestart) {
			pendingRuntimeRestart = false;
			appendLogLine(
				"[config] Settings changed. Restarting agent with latest configuration.",
			);
			void startAgent(true);
		}
	}, 300);
}

function handleRuntimeEvent(event: RuntimeEvent): void {
	if (event.type === "text_delta") {
		appendOutput(event.delta);
		return;
	}

	if (event.type === "tool_start") {
		const details = summarizeEventDetails(event.args);
		appendLogLine(
			`[tool:start] ${event.toolName}${details ? ` ${details}` : ""}`,
		);
		return;
	}

	if (event.type === "tool_end") {
		const state = event.isError ? "error" : "done";
		const details = summarizeEventDetails(event.result);
		appendLogLine(
			`[tool:${state}] ${event.toolName}${details ? ` ${details}` : ""}`,
		);
		return;
	}

	if (event.type === "status") {
		if (!shouldRenderStatus(event.message)) {
			return;
		}
		const formatted = formatRuntimeStatus(event.message);
		const now = Date.now();
		if (formatted === lastRenderedStatus && now - lastRenderedStatusAt < 8000) {
			return;
		}
		lastRenderedStatus = formatted;
		lastRenderedStatusAt = now;
		appendLogLine(`[status] ${formatted}`);
		return;
	}

	if (event.type === "error") {
		appendLogLine(`[error] ${event.message}`);
		return;
	}

	if (event.type === "done") {
		lastRenderedStatus = "";
		lastRenderedStatusAt = 0;
		setLocalStatus("Ready");
	}
}

function shouldRenderStatus(raw: string): boolean {
	const normalized = raw.trim();
	if (!normalized) {
		return false;
	}
	const verbosity = readTelecodeSettings().agent.statusVerbosity;
	if (verbosity === "debug") {
		return true;
	}
	if (verbosity === "normal") {
		if (
			normalized.startsWith("event:") ||
			STATUS_SUPPRESSED_PREFIXES_NORMAL.some((prefix) =>
				normalized.startsWith(prefix),
			)
		) {
			return false;
		}
		return true;
	}
	if (
		STATUS_SUPPRESSED_PREFIXES_NORMAL.some((prefix) =>
			normalized.startsWith(prefix),
		)
	) {
		return false;
	}
	for (const prefix of STATUS_SUPPRESSED_PREFIXES_MINIMAL) {
		if (normalized.startsWith(prefix)) {
			return false;
		}
	}
	return true;
}

function appendOutput(text: string): void {
	chatProvider?.appendOutput(text);
}

function appendLogLine(line: string): void {
	if (shouldCoalesceLogLine(line)) {
		if (line === pendingDuplicateLogLine) {
			pendingDuplicateLogCount += 1;
			return;
		}
		flushDuplicateLogSummary();
		pendingDuplicateLogLine = line;
		pendingDuplicateLogCount = 1;
		pendingDuplicateLogStartedAt = Date.now();
		appendOutput(`${line}\n`);
		return;
	}
	flushDuplicateLogSummary();
	appendOutput(`${line}\n`);
}

function shouldCoalesceLogLine(line: string): boolean {
	return (
		line.startsWith("[status] ") ||
		line.startsWith("[phase] ") ||
		line.startsWith("[heartbeat] ")
	);
}

function flushDuplicateLogSummary(): void {
	if (pendingDuplicateLogCount <= 1 || pendingDuplicateLogLine.length === 0) {
		pendingDuplicateLogLine = "";
		pendingDuplicateLogCount = 0;
		pendingDuplicateLogStartedAt = 0;
		return;
	}

	const repeatedTimes = pendingDuplicateLogCount - 1;
	const elapsedSec = Math.max(
		0,
		Math.round((Date.now() - pendingDuplicateLogStartedAt) / 1000),
	);
	appendOutput(
		`[status] repeated ${repeatedTimes} more times${
			elapsedSec > 0 ? ` over ${elapsedSec}s` : ""
		}\n`,
	);
	pendingDuplicateLogLine = "";
	pendingDuplicateLogCount = 0;
	pendingDuplicateLogStartedAt = 0;
}

function applyStatus(status: string): void {
	activeStatus = status;
	chatProvider?.setStatus(status);
	syncProgressState(status);
	if (!isBusyStatus(status)) {
		flushDuplicateLogSummary();
	}
}

function setLocalStatus(status: string): void {
	localStatus = status;
	syncEffectiveStatus();
}

function setChannelStatus(channelId: string, status: string): void {
	channelStatuses.set(channelId, status);
	syncEffectiveStatus();
}

function clearChannelStatuses(): void {
	if (channelStatuses.size === 0) {
		return;
	}
	channelStatuses.clear();
	syncEffectiveStatus();
}

function syncEffectiveStatus(): void {
	const nextStatus = getEffectiveStatus();
	applyStatus(nextStatus);
}

function getEffectiveStatus(): string {
	if (shouldPreferLocalStatus(localStatus)) {
		return localStatus;
	}

	const aggregatedChannelStatus = getAggregatedChannelStatus();
	return aggregatedChannelStatus ?? localStatus;
}

function shouldPreferLocalStatus(status: string): boolean {
	const normalized = status.trim().toLowerCase();
	return (
		isBusyStatus(status) ||
		normalized.includes("error") ||
		normalized.includes("stopped")
	);
}

function getAggregatedChannelStatus(): string | null {
	const statuses = [...channelStatuses.values()]
		.map((status) => status.trim())
		.filter((status) => status.length > 0);

	if (statuses.length === 0) {
		return null;
	}

	const topPriority = Math.max(...statuses.map((status) => getStatusPriority(status)));
	const topStatuses = statuses.filter(
		(status) => getStatusPriority(status) === topPriority,
	);
	const uniqueTopStatuses = [...new Set(topStatuses)];

	if (topPriority >= 300) {
		return uniqueTopStatuses.length === 1 ? uniqueTopStatuses[0] : "Channels active";
	}

	return uniqueTopStatuses[0] ?? null;
}

function getStatusPriority(status: string): number {
	const normalized = status.trim().toLowerCase();
	if (normalized.includes("error")) {
		return 400;
	}
	if (isBusyStatus(status)) {
		return 300;
	}
	if (normalized.includes("ready")) {
		return 200;
	}
	if (normalized.includes("idle")) {
		return 100;
	}
	if (normalized.includes("stopped")) {
		return 50;
	}
	return 0;
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
		appendLogLine(`[ui] refreshed (${changedFile})`);
	}, 150);
}

function syncSettingsToChatView(): void {
	const settings = readTelecodeSettings();
	const payload: ChatViewSettings = {
		provider: settings.agent.provider,
		model: settings.agent.model,
		apiKey: settings.agent.apiKey,
		baseUrl: settings.agent.baseUrl || "",
		maxSteps: settings.agent.maxSteps,
		logMaxChars: settings.agent.logMaxChars,
		channelLogLines: settings.agent.channelLogLines,
		statusVerbosity: settings.agent.statusVerbosity,
		safeModeProfile: settings.agent.safeModeProfile,
		responseStyle: settings.agent.responseStyle,
		language: settings.agent.language,
		uiLanguage: settings.agent.uiLanguage,
		allowOutOfWorkspace: settings.agent.allowOutOfWorkspace,
		telegramEnabled: settings.telegram.enabled,
		telegramBotToken: settings.telegram.botToken,
		telegramChatId: settings.telegram.chatId || "",
		telegramApiRoot: settings.telegram.apiRoot || "https://api.telegram.org",
		telegramForceIPv4: settings.telegram.forceIPv4,
		whatsappEnabled: settings.whatsapp.enabled,
		whatsappSessionPath:
			settings.whatsapp.sessionPath || "~/.telecode-ai/whatsapp-session.json",
		whatsappAllowSelfCommands: settings.whatsapp.allowSelfCommands,
		whatsappAccessMode: settings.whatsapp.accessMode,
		whatsappAllowedPhones: settings.whatsapp.allowedPhones.join(","),
	};

	chatProvider?.setSettings(payload);
}

function syncBuildInfoToChatView(): void {
	const loadedAt = new Date().toLocaleString();
	let builtAt = "unknown";

	try {
		const stat = fs.statSync(__filename);
		builtAt = stat.mtime.toLocaleString();
	} catch {
		// keep unknown
	}

	chatProvider?.setBuildInfo(
		`version=${extensionVersion}; build=${builtAt}; loaded=${loadedAt}`,
	);
}

function notifySettingsViews(message: string): void {
	chatProvider?.notify(message);
}

function setupPromptStackWatcher(context: vscode.ExtensionContext): void {
	const watcher = vscode.workspace.createFileSystemWatcher("**/prompts/*.md");
	const onPromptChanged = (uri: vscode.Uri) => {
		appendLogLine(`[prompt] changed: ${path.basename(uri.fsPath)}`);
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

function installLlmFetchLogger(): void {
	if (restoreFetchLogger) {
		return;
	}

	const originalFetch = globalThis.fetch;
	if (typeof originalFetch !== "function") {
		return;
	}

	globalThis.fetch = (async (input: unknown, init?: unknown) => {
		const { url, method } = extractRequestInfo(input, init);
		const isTelegram = url.toLowerCase().includes("api.telegram.org");
		const shouldLog = shouldLogLlmRequest(url);
		const startedAt = Date.now();

		try {
			const fetchArgs = isTelegram
				? buildTelegramFetchArgs(input, init, url, method)
				: { input, init };
			const response = await originalFetch(
				fetchArgs.input as never,
				fetchArgs.init as never,
			);
			if (shouldLog) {
				const elapsed = Date.now() - startedAt;
				appendLogLine(
					`[llm:res] ${response.status} ${method} ${safeUrlForLog(
						url,
					)} ${elapsed}ms`,
				);
			}
			return response;
		} catch (error) {
			if (shouldLog) {
				const elapsed = Date.now() - startedAt;
				const message = error instanceof Error ? error.message : String(error);
				appendLogLine(
					`[llm:error] ${method} ${safeUrlForLog(
						url,
					)} ${elapsed}ms ${message}`,
				);
			}
			throw error;
		}
	}) as typeof fetch;

	restoreFetchLogger = () => {
		globalThis.fetch = originalFetch;
	};
}

function sanitizeTelegramFetchInit(init?: unknown): unknown {
	if (!init || typeof init !== "object") {
		return init;
	}
	const maybeInit = init as Record<string, unknown>;
	if (!("signal" in maybeInit)) {
		return init;
	}
	// grammY can pass a signal object from a different realm/package.
	// undici then throws "Expected signal to be an instanceof AbortSignal".
	// Telegram checks are short requests, so dropping signal here is safe and
	// prevents startup from failing.
	const { signal, ...rest } = maybeInit;
	void signal;
	return rest;
}

function buildTelegramFetchArgs(
	input: unknown,
	init: unknown,
	url: string,
	method: string,
): { input: unknown; init: unknown } {
	const sanitizedInit = sanitizeTelegramFetchInit(init);
	// If fetch was called with Request object, it can carry a cross-realm signal
	// that undici rejects even when init.signal is removed. For Telegram calls
	// we normalize to URL + plain init object.
	if (typeof Request !== "undefined" && input instanceof Request) {
		const reqInit: Record<string, unknown> = {};
		reqInit.method = method || input.method || "GET";
		if (input.headers) reqInit.headers = input.headers;
		// Body must come from explicit init (for POST calls from grammY this is present).
		if (
			sanitizedInit &&
			typeof sanitizedInit === "object" &&
			"body" in (sanitizedInit as Record<string, unknown>)
		) {
			reqInit.body = (sanitizedInit as Record<string, unknown>).body;
		}
		const merged =
			sanitizedInit && typeof sanitizedInit === "object"
				? { ...reqInit, ...(sanitizedInit as Record<string, unknown>) }
				: reqInit;
		return { input: url, init: merged };
	}
	return { input, init: sanitizedInit };
}

function extractRequestInfo(
	input: unknown,
	init?: unknown,
): { url: string; method: string } {
	let url = "(unknown-url)";
	let method = "GET";

	if (typeof input === "string") {
		url = input;
	} else if (input instanceof URL) {
		url = input.toString();
	} else if (input && typeof input === "object") {
		const requestLike = input as { url?: string; method?: string };
		if (typeof requestLike.url === "string") {
			url = requestLike.url;
		}
		if (
			typeof requestLike.method === "string" &&
			requestLike.method.length > 0
		) {
			method = requestLike.method.toUpperCase();
		}
	}

	if (init && typeof init === "object") {
		const initLike = init as { method?: string };
		if (typeof initLike.method === "string" && initLike.method.length > 0) {
			method = initLike.method.toUpperCase();
		}
	}

	return { url, method };
}

function shouldLogLlmRequest(url: string): boolean {
	if (!url || url === "(unknown-url)") {
		return false;
	}

	const normalized = url.toLowerCase();
	if (
		normalized.includes("api.telegram.org") ||
		normalized.startsWith("vscode-webview://") ||
		normalized.startsWith("file://")
	) {
		return false;
	}

	return (
		normalized.includes("/v1/chat/completions") ||
		normalized.includes("/v1/responses") ||
		normalized.includes("/chat/completions") ||
		normalized.includes("/responses") ||
		normalized.includes("openrouter.ai") ||
		normalized.includes("moonshot.ai") ||
		normalized.includes("deepseek.com") ||
		normalized.includes("api.openai.com") ||
		normalized.includes("anthropic.com")
	);
}

function safeUrlForLog(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.origin}${parsed.pathname}`;
	} catch {
		return url.split("?")[0];
	}
}

function isBusyStatus(status: string): boolean {
	const lower = status.trim().toLowerCase();
	return (
		lower.includes("running") ||
		lower.includes("thinking") ||
		lower.includes("tool ") ||
		lower.includes("connecting")
	);
}

function syncProgressState(status: string): void {
	const busy = isBusyStatus(status);
	if (!busy) {
		statusStartedAt = 0;
		toolCountInRun = 0;
		lastToolStatus = "";
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
		lastToolStatus = "";
	}

	const lower = status.toLowerCase();
	if (lower.includes("tool ") && status !== lastToolStatus) {
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

	const elapsedSec = Math.max(
		0,
		Math.floor((Date.now() - statusStartedAt) / 1000),
	);
	const maxSteps = readTelecodeSettings().agent.maxSteps;
	const toolsPart =
		toolCountInRun > 0 ? ` • tools ${toolCountInRun}/${maxSteps}` : "";
	chatProvider?.setProgress(
		`${activeStatus} • ${elapsedSec}s${toolsPart}`,
		true,
	);
}

function formatRuntimeStatus(message: string): string {
	const settings = readTelecodeSettings();
	const lang =
		settings.agent.language === "auto"
			? resolveUiLanguage("auto")
			: settings.agent.language;
	i18n.setLanguage(lang as "ru" | "en");
	return i18n.formatStatus(message);
}

function summarizeEventDetails(value: unknown): string {
	if (!value || typeof value !== "object") {
		return "";
	}

	const record = value as Record<string, unknown>;
	const details: string[] = [];
	pushDetail(details, "path", record.path);
	pushDetail(details, "query", record.query);
	pushDetail(details, "pattern", record.pattern);
	pushDetail(details, "command", record.command);
	pushDetail(details, "cwd", record.cwd);
	pushDetail(details, "count", record.count);
	pushDetail(details, "bytes", record.bytes);
	if (
		details.length === 0 &&
		"details" in record &&
		record.details &&
		typeof record.details === "object"
	) {
		const nested = record.details as Record<string, unknown>;
		pushDetail(details, "path", nested.path);
		pushDetail(details, "count", nested.count);
		pushDetail(details, "bytes", nested.bytes);
		pushDetail(details, "cwd", nested.cwd);
	}
	return details.join(" ");
}

function pushDetail(target: string[], key: string, value: unknown): void {
	if (value === undefined || value === null) {
		return;
	}
	const normalized = String(value).replace(/\s+/g, " ").trim();
	if (!normalized) {
		return;
	}
	const compact =
		normalized.length > 64 ? `${normalized.slice(0, 61)}...` : normalized;
	target.push(`${key}=${compact}`);
}
