import type {
	RemoteChannelId,
	RemoteTaskHistoryQuery,
	RemoteTaskStatus,
} from "./remoteTasks";

const TASK_STATUSES: RemoteTaskStatus[] = [
	"queued",
	"running",
	"completed",
	"failed",
	"interrupted",
	"cancelled",
];

export function parseHistoryArgs(
	input: string,
	defaults: { limit: number; maxLimit: number; channel?: RemoteChannelId; chatId?: string },
): RemoteTaskHistoryQuery {
	const tokens = input
		.trim()
		.split(/\s+/)
		.filter((token) => token.length > 0);
	const query: RemoteTaskHistoryQuery = {
		limit: defaults.limit,
		channel: defaults.channel,
		chatId: defaults.chatId,
	};
	const textParts: string[] = [];

	for (const token of tokens) {
		if (/^\d+$/.test(token)) {
			query.limit = Math.min(Math.max(Number.parseInt(token, 10), 1), defaults.maxLimit);
			continue;
		}

		const lowered = token.toLowerCase();
		if (TASK_STATUSES.includes(lowered as RemoteTaskStatus)) {
			query.status = lowered as RemoteTaskStatus;
			continue;
		}

		if (lowered === "telegram" || lowered === "whatsapp") {
			query.channel = lowered as RemoteChannelId;
			continue;
		}

		if (lowered.startsWith("chat:")) {
			query.chatId = token.slice(5);
			continue;
		}

		textParts.push(token);
	}

	if (textParts.length > 0) {
		query.text = textParts.join(" ");
	}

	return query;
}

export function parseTaskSelector(
	input: string,
): { id?: number; kind?: "last" | "active" } | null {
	const value = input.trim().toLowerCase();
	if (!value || value === "last") {
		return { kind: "last" };
	}
	if (value === "active" || value === "running") {
		return { kind: "active" };
	}
	if (/^\d+$/.test(value)) {
		return { id: Number.parseInt(value, 10) };
	}
	return null;
}

export type ScheduleCommand =
	| { kind: "list" }
	| { kind: "add"; intervalMinutes: number; prompt: string }
	| { kind: "remove" | "pause" | "resume" | "run"; id: number };

export function parseScheduleCommand(input: string): ScheduleCommand | null {
	const trimmed = input.trim();
	if (!trimmed || trimmed === "list") {
		return { kind: "list" };
	}

	const [command, ...rest] = trimmed.split(/\s+/);
	if (command === "every" || command === "add") {
		const minutes = Number.parseInt(rest[0] || "", 10);
		const prompt = rest.slice(1).join(" ").trim();
		if (!Number.isFinite(minutes) || minutes <= 0 || !prompt) {
			return null;
		}
		return { kind: "add", intervalMinutes: minutes, prompt };
	}

	if (
		command === "remove" ||
		command === "pause" ||
		command === "resume" ||
		command === "run"
	) {
		const id = Number.parseInt(rest[0] || "", 10);
		if (!Number.isFinite(id)) {
			return null;
		}
		return { kind: command, id };
	}

	return null;
}
