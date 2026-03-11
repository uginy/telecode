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
	onLog: (line: string) => void;
	onStatus: (status: string) => void;
}): IChannel[] {
	const channels: IChannel[] = [];

	if (options.settings.telegram.enabled) {
		channels.push(
			new TelegramChannel(
				options.tools,
				(line) => options.onLog(prefixChannelLog("telegram", line)),
				options.onStatus,
			),
		);
	}

	if (options.settings.whatsapp.enabled) {
		channels.push(
			new WhatsAppChannel(
				options.tools,
				(line) => options.onLog(prefixChannelLog("whatsapp", line)),
				options.onStatus,
			),
		);
	}

	return channels;
}
