import { ChannelRegistry } from "../channels/channelRegistry";
import { createEnabledChannels } from "../channels/factory";
import { readTelecodeSettings } from "../config/settings";
import { resolveAgentTools } from "../agent/runtimePolicy";
import type { ChatViewProvider } from "../ui/chatViewProvider";
import type { UiStatusController } from "./uiStatusController";

export class ChannelController {
	private readonly registry: ChannelRegistry;

	constructor(
		private readonly uiStatus: UiStatusController,
		private readonly getChatView: () => Pick<
			ChatViewProvider,
			"setChannelsConnected"
		> | null,
		private readonly getWorkspaceRoot: () => string,
	) {
		this.registry = new ChannelRegistry((message) =>
			this.uiStatus.appendLogLine(message),
		);
	}

	public refresh(): void {
		this.stopAll();

		const settings = readTelecodeSettings();
		const { tools } = resolveAgentTools(settings.agent);
		const workspaceRoot = this.getWorkspaceRoot();
		for (const channel of createEnabledChannels({
			settings,
			tools,
			workspaceRoot,
			onLog: (line) => this.uiStatus.appendLogLine(line),
			onStatus: (channelId, status) => {
				this.uiStatus.setChannelStatus(channelId, status);
				this.syncConnectedState();
			},
		})) {
			this.registry.register(channel);
		}

		if (this.registry.size === 0) {
			this.uiStatus.appendLogLine(
				"[channels] no enabled channels (enable Telegram or WhatsApp in Settings)",
			);
		}

		this.registry.startAllNonBlocking();
		this.syncConnectedState();
	}

	public connect(logToOutput: boolean): void {
		this.refresh();
		if (logToOutput) {
			this.uiStatus.appendLogLine("[channels] Connect requested");
		}
	}

	public disconnect(logToOutput: boolean): void {
		if (this.stopAll()) {
			if (logToOutput) {
				this.uiStatus.appendLogLine("[channels] Disconnected");
			}
			return;
		}

		if (logToOutput) {
			this.uiStatus.appendLogLine("[channels] Already disconnected");
		}
	}

	public stopAll(): boolean {
		if (this.registry.size === 0) {
			return false;
		}

		this.registry.stopAll();
		this.uiStatus.clearChannelStatuses();
		this.syncConnectedState();
		return true;
	}

	private syncConnectedState(): void {
		this.getChatView()?.setChannelsConnected(this.registry.activeIds().length > 0);
	}
}
