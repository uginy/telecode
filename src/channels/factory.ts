import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { TelecodeSettings } from "../config/settings";
import { TelegramChannel } from "./telegram";
import { WhatsAppChannel } from "./whatsapp/channel";
import type { IChannel } from "./types";

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

	if (options.settings.telegram.enabled) {
		channels.push(
			new TelegramChannel(
				options.tools,
				options.workspaceRoot,
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
				(line) => options.onLog(prefixChannelLog("whatsapp", line)),
				(status) => options.onStatus("whatsapp", status),
			),
		);
	}

	return channels;
}
