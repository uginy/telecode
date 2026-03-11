import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { TelecodeSettings } from "../config/settings";
import { RemoteTaskManager } from "./remoteTasks";
import { RemoteScheduleManager } from "./remoteSchedules";
import { TelegramChannel } from "./telegram";
import { WhatsAppChannel } from "./whatsapp/channel";
import type { IChannel } from "./types";

const sharedSchedulers = new Map<string, RemoteScheduleManager>();

function prefixChannelLog(channelId: "telegram" | "whatsapp", line: string): string {
	const basePrefix = `[${channelId}]`;
	const prefixedPattern = new RegExp(
		`^\\[[^\\]]+\\]\\s+\\[${channelId}(?::[^\\]]+)?\\]`,
		"i",
	);
	if (line.startsWith(basePrefix) || prefixedPattern.test(line)) {
		return line;
	}
	return `${basePrefix} ${line}`;
}

export function createEnabledChannels(options: {
	settings: TelecodeSettings;
	tools: AgentTool[];
	workspaceRoot: string;
	onLog: (line: string) => void;
	onStatus: (channelId: "telegram" | "whatsapp", status: string) => void;
}): IChannel[] {
	const channels: IChannel[] = [];
	const remoteTasks = new RemoteTaskManager(
		options.workspaceRoot,
		(line) => options.onLog(line),
	);
	const remoteSchedules =
		sharedSchedulers.get(options.workspaceRoot) ||
		new RemoteScheduleManager(options.workspaceRoot, (line) => options.onLog(line));
	sharedSchedulers.set(options.workspaceRoot, remoteSchedules);

	if (options.settings.telegram.enabled) {
		channels.push(
			new TelegramChannel(
				options.tools,
				options.workspaceRoot,
				remoteTasks,
				remoteSchedules,
				(line) => options.onLog(prefixChannelLog("telegram", line)),
				(status) => options.onStatus("telegram", status),
			),
		);
	}

	if (options.settings.whatsapp.enabled) {
		channels.push(
			new WhatsAppChannel(
				options.tools,
				options.workspaceRoot,
				remoteTasks,
				remoteSchedules,
				(line) => options.onLog(prefixChannelLog("whatsapp", line)),
				(status) => options.onStatus("whatsapp", status),
			),
		);
	}

	return channels;
}
