import * as vscode from "vscode";
import type { TaskRunner } from "../agent/taskRunner";
import {
	buildRuntimeConfig,
	createRuntimeSignature,
	createTaskRunner,
} from "../agent/runtimeSession";
import { resolveAgentTools } from "../agent/runtimePolicy";
import {
	providerRequiresApiKey,
	readTelecodeSettings,
} from "../config/settings";
import type { RuntimeConfig } from "../engine/types";
import {
	getPrimaryWorkspaceRoot,
	saveOpenSettingsFiles,
} from "../utils/vscodeUtils";
import { UiStatusController, isBusyStatus } from "./uiStatusController";
import type { TaskOutcome } from "./taskReview";

export class RuntimeController {
	private taskRunner: TaskRunner | null = null;
	private sessionApiKey = "";
	private runningConfigSignature = "";

	constructor(
		private readonly uiStatus: UiStatusController,
		private readonly refreshChannels: () => void,
		private readonly onTaskStarted?: (prompt: string) => Promise<void>,
		private readonly onTaskSettled?: (options: {
			prompt: string;
			outcome: TaskOutcome;
			error?: string;
		}) => Promise<void>,
	) {}

	public hasRuntime(): boolean {
		return !!this.taskRunner?.runtime;
	}

	public clearHistory(): void {
		this.taskRunner?.clearHistorySync();
	}

	public setSessionApiKey(apiKey: string): void {
		this.sessionApiKey = apiKey;
	}

	public stop(): boolean {
		if (!this.taskRunner?.runtime) {
			return false;
		}

		this.taskRunner.abortCurrentRun();
		this.runningConfigSignature = "";
		return true;
	}

	public async start(forceRestart: boolean): Promise<boolean> {
		const settings = readTelecodeSettings();
		const { policy, tools } = resolveAgentTools(settings.agent);

		let apiKey = settings.agent.apiKey;
		if (!apiKey && this.sessionApiKey) {
			apiKey = this.sessionApiKey;
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

			this.sessionApiKey = enteredApiKey.trim();
			apiKey = this.sessionApiKey;

			try {
				await saveOpenSettingsFiles();
				await vscode.workspace
					.getConfiguration("telecode")
					.update("apiKey", apiKey, vscode.ConfigurationTarget.Global);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.uiStatus.appendLogLine(
					`[settings:warn] Failed to persist API key: ${message}`,
				);
			}
		}

		const workspaceRoot = getPrimaryWorkspaceRoot();
		const config: RuntimeConfig = {
			...buildRuntimeConfig(settings.agent, {
				cwd: workspaceRoot,
				allowedTools: policy.allowedTools,
				allowOutOfWorkspace: policy.allowOutOfWorkspace,
			}),
			apiKey,
		};

		const signature = createRuntimeSignature(config, tools);
		if (
			!forceRestart &&
			this.taskRunner?.runtime &&
			this.runningConfigSignature === signature
		) {
			this.refreshChannels();
			this.uiStatus.setLocalStatus("Ready");
			return true;
		}

		if (this.taskRunner?.runtime) {
			this.taskRunner.abortCurrentRun();
			this.runningConfigSignature = "";
		}

		try {
			if (!this.taskRunner) {
				this.taskRunner = createTaskRunner({
					onEvent: (event) => {
						this.uiStatus.handleRuntimeEvent(event);
					},
					onStateChange: (state) => {
						if (state === "error" && !isBusyStatus(this.uiStatus.getActiveStatus())) {
							this.uiStatus.setLocalStatus("Error");
						} else if (state === "idle" || state === "stopped") {
							this.uiStatus.setLocalStatus("Idle");
						}
					},
					watchdogTimeoutMs: 180_000,
					workspaceRoot,
				});
			}

			const runtime = this.taskRunner.initRuntime(config, tools);
			this.runningConfigSignature = signature;

			this.uiStatus.appendLogLine(
				`[agent] Started with ${config.provider}/${config.model}`,
			);
			const resolvedModel = runtime.getModelInfo?.();
			if (resolvedModel) {
				this.uiStatus.appendLogLine(
					`[agent:model] api=${resolvedModel.api} provider=${resolvedModel.provider} model=${resolvedModel.id} baseUrl=${resolvedModel.baseUrl}`,
				);
			}
			const promptInfo = runtime.getPromptInfo?.();
			if (promptInfo) {
				this.uiStatus.appendLogLine(
					`[agent:prompt] source=${promptInfo.source} layers=${promptInfo.layerCount} signature=${promptInfo.signature}`,
				);
				if (promptInfo.missing.length > 0) {
					this.uiStatus.appendLogLine(
						`[agent:prompt] missing=${promptInfo.missing.join(",")}`,
					);
				}
			}
			this.refreshChannels();
			this.uiStatus.setLocalStatus("Ready");
			this.uiStatus.appendLogLine(
				"[system] TeleCode started (agent + enabled channels)",
			);
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(
				`TeleCode AI: failed to start agent - ${message}`,
			);
			this.uiStatus.appendLogLine(`[agent:error] ${message}`);
			this.uiStatus.setLocalStatus("Error");
			return false;
		}
	}

	public async runTask(task: string): Promise<void> {
		const prompt = task.trim();
		if (prompt.length === 0) {
			return;
		}

		const started = await this.start(false);
		const runtime = this.taskRunner?.runtime;
		if (!started || !runtime) {
			return;
		}

		const settings = readTelecodeSettings();
		const preview =
			prompt.length > 240 ? `${prompt.slice(0, 240)}...` : prompt;

		this.uiStatus.appendLogLine(
			`[request] provider=${settings.agent.provider} model=${
				settings.agent.model
			} baseUrl=${settings.agent.baseUrl || "(default)"}`,
		);
		this.uiStatus.appendLogLine(`[request] prompt="${preview}"`);
		const resolvedModel = runtime.getModelInfo?.();
		if (resolvedModel) {
			this.uiStatus.appendLogLine(
				`[request:model] api=${resolvedModel.api} provider=${resolvedModel.provider} model=${resolvedModel.id} baseUrl=${resolvedModel.baseUrl}`,
			);
		}
		this.uiStatus.appendLogLine(`[user] ${prompt}`);
		this.uiStatus.setLocalStatus("Running");

		try {
			await this.captureTaskStart(prompt);
			await this.taskRunner?.runTask(prompt);
			await this.captureTaskResult({
				prompt,
				outcome: "completed",
			});
			this.uiStatus.setLocalStatus("Ready");
			this.uiStatus.appendLogLine("[run] done");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.captureTaskResult({
				prompt,
				outcome: "failed",
				error: message,
			});
			this.uiStatus.appendLogLine(`[run:error] ${message}`);
			this.uiStatus.setLocalStatus("Error");
		}
	}

	private async captureTaskResult(options: {
		prompt: string;
		outcome: TaskOutcome;
		error?: string;
	}): Promise<void> {
		if (!this.onTaskSettled) {
			return;
		}

		try {
			await this.onTaskSettled(options);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.uiStatus.appendLogLine(`[review:error] ${message}`);
		}
	}

	private async captureTaskStart(prompt: string): Promise<void> {
		if (!this.onTaskStarted) {
			return;
		}

		try {
			await this.onTaskStarted(prompt);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.uiStatus.appendLogLine(`[review:error] ${message}`);
		}
	}
}
