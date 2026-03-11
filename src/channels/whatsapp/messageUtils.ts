const WA_MESSAGE_LIMIT = 3000;

export type IncomingCommand = "help" | "status" | "stop" | "run" | null;

/** Minimal shape of a Baileys incoming message. */
export type BaileysMessage = {
	key: {
		id?: string;
		remoteJid?: string;
		fromMe?: boolean;
		participant?: string;
	};
	message?: {
		conversation?: string;
		extendedTextMessage?: {
			text?: string;
		};
	};
};

export function splitWhatsappText(
	input: string,
	limit = WA_MESSAGE_LIMIT,
): string[] {
	const text = input.trim();
	if (!text) return ["Done."];
	if (text.length <= limit) return [text];
	const out: string[] = [];
	let i = 0;
	while (i < text.length) {
		out.push(text.slice(i, i + limit));
		i += limit;
	}
	return out;
}

export function summarizeWhatsappToolPayload(value: unknown): string {
	if (!value || typeof value !== "object") {
		return "";
	}

	const record = findSummaryRecord(value as Record<string, unknown>);
	const parts: string[] = [];
	pushSummary(parts, "command", record.command ?? record.cmd);
	pushSummary(parts, "path", record.path);
	pushSummary(parts, "cwd", record.cwd);
	pushSummary(parts, "query", record.query);
	pushSummary(parts, "pattern", record.pattern);
	pushSummary(parts, "glob", record.glob);
	pushSummary(parts, "count", record.count);
	pushSummary(parts, "bytes", record.bytes);
	pushSummary(parts, "replacements", record.replacements);

	return parts.join(" ");
}

export function parseWhatsappCommand(body: string): IncomingCommand {
	if (body.startsWith("/help")) return "help";
	if (body.startsWith("/status")) return "status";
	if (body.startsWith("/stop")) return "stop";
	if (body.startsWith("/run ")) return "run";
	return null;
}

export function extractWhatsappMessageText(msg: BaileysMessage): string {
	return (
		msg.message?.conversation?.trim() ||
		msg.message?.extendedTextMessage?.text?.trim() ||
		""
	);
}

export function extractWhatsappMessageId(msg: BaileysMessage): string | null {
	const id = msg.key?.id;
	if (typeof id === "string" && id.length > 0) return id;
	return null;
}

export function normalizeWhatsappMessageText(text: string): string {
	return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function findSummaryRecord(
	record: Record<string, unknown>,
	depth = 0,
): Record<string, unknown> {
	if (
		record.command !== undefined ||
		record.cmd !== undefined ||
		record.path !== undefined ||
		record.cwd !== undefined ||
		record.query !== undefined ||
		record.pattern !== undefined ||
		record.glob !== undefined
	) {
		return record;
	}

	if (depth >= 3) {
		return record;
	}

	for (const key of ["details", "args", "input", "params", "result"]) {
		const nested = record[key];
		if (nested && typeof nested === "object") {
			return findSummaryRecord(nested as Record<string, unknown>, depth + 1);
		}
	}

	return record;
}

function pushSummary(parts: string[], key: string, value: unknown): void {
	if (value === undefined || value === null) {
		return;
	}

	const text = String(value).replace(/\s+/g, " ").trim();
	if (!text) {
		return;
	}

	const compact = text.length > 70 ? `${text.slice(0, 67)}...` : text;
	parts.push(`${key}=${compact}`);
}
