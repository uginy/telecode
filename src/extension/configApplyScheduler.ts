import * as vscode from "vscode";

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

export class ConfigApplyScheduler {
	private channelsRefreshTimer: NodeJS.Timeout | null = null;
	private configApplyTimer: NodeJS.Timeout | null = null;
	private pendingChannelsRefresh = false;
	private pendingSettingsSync = false;
	private pendingRuntimeRestart = false;

	public dispose(): void {
		if (this.channelsRefreshTimer) {
			clearTimeout(this.channelsRefreshTimer);
			this.channelsRefreshTimer = null;
		}
		if (this.configApplyTimer) {
			clearTimeout(this.configApplyTimer);
			this.configApplyTimer = null;
		}
	}

	public handleConfigurationChange(
		event: vscode.ConfigurationChangeEvent,
		options: {
			hasRuntime: boolean;
			syncSettings: () => void;
			refreshChannels: () => void;
			restartRuntime: () => void;
			onRestartPlanned?: () => void;
		},
	): void {
		if (!event.affectsConfiguration("telecode")) {
			return;
		}

		this.pendingSettingsSync = true;

		if (affectsAnyConfiguration(event, CHANNEL_CONFIG_KEYS)) {
			this.pendingChannelsRefresh = true;
		}

		if (
			options.hasRuntime &&
			affectsAnyConfiguration(event, RUNTIME_RESTART_CONFIG_KEYS)
		) {
			this.pendingRuntimeRestart = true;
		}

		this.scheduleConfigApply(options);
	}

	private scheduleChannelsRefresh(refreshChannels: () => void): void {
		if (this.channelsRefreshTimer) {
			clearTimeout(this.channelsRefreshTimer);
		}

		this.channelsRefreshTimer = setTimeout(() => {
			this.channelsRefreshTimer = null;
			refreshChannels();
		}, 250);
	}

	private scheduleConfigApply(options: {
		syncSettings: () => void;
		refreshChannels: () => void;
		restartRuntime: () => void;
		onRestartPlanned?: () => void;
	}): void {
		if (this.configApplyTimer) {
			clearTimeout(this.configApplyTimer);
		}

		this.configApplyTimer = setTimeout(() => {
			this.configApplyTimer = null;

			if (this.pendingSettingsSync) {
				this.pendingSettingsSync = false;
				options.syncSettings();
			}

			if (this.pendingChannelsRefresh) {
				this.pendingChannelsRefresh = false;
				this.scheduleChannelsRefresh(options.refreshChannels);
			}

			if (this.pendingRuntimeRestart) {
				this.pendingRuntimeRestart = false;
				options.onRestartPlanned?.();
				options.restartRuntime();
			}
		}, 300);
	}
}
