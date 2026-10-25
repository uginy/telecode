import type { AgentMessage } from "@earendil-works/pi-agent-core";

const CHARS_PER_TOKEN = 4;
const IMAGE_TOKENS = 1_500;
/** Start trimming once the estimated context exceeds this share of the model window. */
const COMPACTION_THRESHOLD = 0.6;
/** The latest messages stay intact so the current step keeps full tool output. */
const KEEP_RECENT_MESSAGES = 8;
const TRIMMED_PREVIEW_CHARS = 400;

function estimateTokens(message: AgentMessage): number {
	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") return Math.ceil(content.length / CHARS_PER_TOKEN);
	if (!Array.isArray(content)) return 0;
	let chars = 0;
	let images = 0;
	for (const block of content as { type?: string; text?: string; thinking?: string; arguments?: unknown }[]) {
		if (block.type === "image") images++;
		else if (block.type === "text") chars += block.text?.length ?? 0;
		else if (block.type === "thinking") chars += block.thinking?.length ?? 0;
		else if (block.type === "toolCall") chars += JSON.stringify(block.arguments ?? {}).length;
	}
	return Math.ceil(chars / CHARS_PER_TOKEN) + images * IMAGE_TOKENS;
}

/**
 * Keeps long runs inside the model window by masking old tool outputs.
 * Transcript structure (tool call / result pairs) is preserved; only result bodies shrink.
 * shortcut: no LLM summary and large tool-call arguments stay as-is; add a summarizing pass if runs still overflow.
 */
export function compactContext(messages: AgentMessage[], contextWindow: number): AgentMessage[] {
	const budget = Math.floor(contextWindow * COMPACTION_THRESHOLD);
	const sizes = messages.map(estimateTokens);
	let total = sizes.reduce((sum, size) => sum + size, 0);
	if (total <= budget) return messages;

	const result = [...messages];
	const lastTrimmable = messages.length - KEEP_RECENT_MESSAGES;
	for (let i = 0; i < lastTrimmable && total > budget; i++) {
		const message = result[i];
		if (message.role !== "toolResult" || sizes[i] * CHARS_PER_TOKEN <= TRIMMED_PREVIEW_CHARS * 2) continue;
		const text = message.content
			.map((block) => (block.type === "text" ? block.text : ""))
			.join("\n");
		const trimmed = {
			...message,
			content: [{
				type: "text" as const,
				text: `${text.slice(0, TRIMMED_PREVIEW_CHARS)}\n[...older tool output trimmed to save context; run the tool again if you need it]`,
			}],
		};
		const trimmedSize = estimateTokens(trimmed);
		total -= sizes[i] - trimmedSize;
		result[i] = trimmed;
	}
	return result;
}
