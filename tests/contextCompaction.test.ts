import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { compactContext } from "../src/agent/contextCompaction";

function toolResult(id: number, chars: number): AgentMessage {
	return {
		role: "toolResult",
		toolCallId: `call-${id}`,
		toolName: "read_file",
		content: [{ type: "text", text: "x".repeat(chars) }],
		isError: false,
		timestamp: id,
	};
}

describe("compactContext", () => {
	it("returns the same array when under budget", () => {
		const messages = [toolResult(1, 1_000)];
		expect(compactContext(messages, 128_000)).toBe(messages);
	});

	it("trims old tool results and keeps recent ones intact", () => {
		const messages = Array.from({ length: 12 }, (_, i) => toolResult(i, 20_000));
		const compacted = compactContext(messages, 40_000);

		const textOf = (m: AgentMessage) =>
			(m as { content: { text: string }[] }).content[0].text;
		expect(textOf(compacted[0])).toContain("older tool output trimmed");
		expect(textOf(compacted[11])).toHaveLength(20_000);
		expect(compacted).toHaveLength(12);
		expect(messages[0]).toEqual(toolResult(0, 20_000));
	});
});
