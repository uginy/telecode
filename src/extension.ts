import * as vscode from "vscode";
import {
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
import {
	createChatViewCommandHandler,
	registerExtensionCommands,
} from "./extension/commandController";
import { ChannelController } from "./extension/channelController";
import { ConfigApplyScheduler } from "./extension/configApplyScheduler";
import { DevWatchController } from "./extension/devWatchController";
import { installLlmFetchLogger } from "./extension/fetchLogger";
import { RuntimeController } from "./extension/runtimeController";
import { TaskReviewController } from "./extension/taskReviewController";
import { UiStatusController } from "./extension/uiStatusController";

let chatProvider: ChatViewProvider | null = null;
const uiStatus = new UiStatusController(() => chatProvider);
const configScheduler = new ConfigApplyScheduler();
const devWatchController = new DevWatchController();
const channels = new ChannelController(
	uiStatus,
	() => chatProvider,
	getPrimaryWorkspaceRoot,
);
const taskReview = new TaskReviewController(
	getPrimaryWorkspaceRoot(),
	() => chatProvider,
	(line) => uiStatus.appendLogLine(line),
);
const runtime = new RuntimeController(
	uiStatus,
	() => channels.refresh(),
	(prompt) => taskReview.markRunStarted(prompt),
	(options) => taskReview.captureRunResult(options),
);
let restoreFetchLogger: (() => void) | null = null;
let extensionVersion = "0.0.0";

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
		chatProvider.onCommand(
			createChatViewCommandHandler({
				startAgent: async () => {
					await runtime.start(false);
				},
				stopAgent: () => {
					stopAgent(true);
				},
				connectChannels: () => {
					channels.connect(true);
				},
				disconnectChannels: () => {
					channels.disconnect(true);
				},
				runTask: async (prompt) => {
					await runtime.runTask(prompt);
				},
				openSettings: () => {
					void chatProvider?.focus();
					chatProvider?.openSettingsTab();
				},
				requestSettings: () => {
					syncSettingsToChatView(chatProvider);
				},
				requestTaskResult: () => {
					chatProvider?.setTaskResult(taskReview.getLatestResult());
				},
				saveSettings: async (command) => {
					await saveSettingsFromChatView(command.settings);
				},
				showTaskDiff: async () => {
					await taskReview.showDiff();
				},
				runTaskChecks: async () => {
					await taskReview.runChecks();
				},
				rerunTaskChanges: async () => {
					await taskReview.rerunLatest((prompt) => runtime.runTask(prompt));
				},
				resumeTaskChanges: async () => {
					await taskReview.resumeInterrupted((prompt) => runtime.runTask(prompt));
				},
				commitTaskChanges: async () => {
					await taskReview.commitLatest();
				},
				revertTaskChanges: async () => {
					await taskReview.revertLatest();
				},
				fetchModels: async (command) => {
					const models = await CodingAgent.fetchModelsFromApi(
						command.provider,
						command.baseUrl,
						command.apiKey,
					);
					if (models.length > 0) {
						chatProvider?.setModels(models);
					}
				},
			}),
		),
	);

	registerExtensionCommands(context, {
		openChat: () => chatProvider?.focus(),
		openSettings: () => {
			void chatProvider?.focus();
			chatProvider?.openSettingsTab();
		},
		startAgent: async () => {
			await runtime.start(false);
		},
		promptTask: async () => {
			const task = await vscode.window.showInputBox({
				prompt: "What should TeleCode AI do?",
				placeHolder: "e.g. refactor src/extension.ts and add tests",
				ignoreFocusOut: true,
			});

			if (task?.trim()) {
				await runtime.runTask(task);
			}
		},
		stopAgent: () => {
			stopAgent(true);
		},
		resetSession: () => {
			runtime.clearHistory();
			vscode.window.showInformationMessage(
				"TeleCode AI: Session history cleared.",
			);
		},
		showTaskDiff: async () => {
			await taskReview.showDiff();
		},
		runTaskChecks: async () => {
			await taskReview.runChecks();
		},
		rerunTaskChanges: async () => {
			await taskReview.rerunLatest((prompt) => runtime.runTask(prompt));
		},
		resumeTaskChanges: async () => {
			await taskReview.resumeInterrupted((prompt) => runtime.runTask(prompt));
		},
		commitTaskChanges: async () => {
			await taskReview.commitLatest();
		},
		revertTaskChanges: async () => {
			await taskReview.revertLatest();
		},
		setResponseStyle: async (style, successMessage) => {
			await saveOpenSettingsFiles();
			await vscode.workspace
				.getConfiguration("telecode")
				.update("responseStyle", style, true);
			vscode.window.showInformationMessage(successMessage);
		},
		setLanguage: async (language, successMessage) => {
			await saveOpenSettingsFiles();
			await vscode.workspace
				.getConfiguration("telecode")
				.update("language", language, true);
			vscode.window.showInformationMessage(successMessage);
		},
	});

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((event) =>
			configScheduler.handleConfigurationChange(event, {
				hasRuntime: runtime.hasRuntime(),
				syncSettings: () => syncSettingsToChatView(chatProvider),
				refreshChannels: () => channels.refresh(),
				restartRuntime: () => {
					void runtime.start(true);
				},
				onRestartPlanned: () => {
					uiStatus.appendLogLine(
						"[config] Settings changed. Restarting agent with latest configuration.",
					);
				},
			}),
		),
	);

	channels.refresh();
	void taskReview.loadPersisted();
	devWatchController.setup(context, {
		onUiRefreshed: (changedFile) => {
			chatProvider?.refresh();
			uiStatus.appendLogLine(`[ui] refreshed (${changedFile})`);
		},
		onPromptChanged: (changedFile) => {
			uiStatus.appendLogLine(`[prompt] changed: ${changedFile}`);
			if (runtime.hasRuntime()) {
				void runtime.start(true);
			}
		},
	});
	syncSettingsToChatView(chatProvider);
	syncBuildInfoToChatView(chatProvider, {
		extensionVersion,
		bundleFilePath: __filename,
	});
	uiStatus.setLocalStatus("Idle");
}

export function deactivate(): void {
	stopAgent(false);
	configScheduler.dispose();
	devWatchController.dispose();
	restoreFetchLogger?.();
	restoreFetchLogger = null;
	uiStatus.dispose();
	channels.stopAll();
}

function stopAgent(logToOutput: boolean): void {
	const stoppedRuntime = runtime.stop();
	const stoppedChannels = channels.stopAll();
	const stoppedSomething = stoppedRuntime || stoppedChannels;

	if (logToOutput && stoppedSomething) {
		uiStatus.appendLogLine("[system] TeleCode stopped (agent + channels)");
	}

	if (stoppedSomething) {
		uiStatus.setLocalStatus("Stopped");
	}
}

async function saveSettingsFromChatView(
	settings: ChatViewSettings,
): Promise<void> {
	try {
		const result = await persistChatViewSettings(settings);
		runtime.setSessionApiKey(result.sessionApiKey);
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
