import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent, AgentTool } from "@mariozechner/pi-agent-core";

const { createAgentMock } = vi.hoisted(() => ({
	createAgentMock: vi.fn(),
}));

vi.mock("../src/agent/codingAgent", () => ({
	createAgent: createAgentMock,
}));

import { PiRuntime } from "../src/engine/piRuntime";

describe("PiRuntime", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("ignores tool_execution_update events to avoid status spam", () => {
		let subscriber: ((event: AgentEvent) => void) | null = null;
		createAgentMock.mockReturnValue({
			subscribe: vi.fn((fn: (event: AgentEvent) => void) => {
				subscriber = fn;
				return () => {};
			}),
			getModelInfo: vi.fn(() => ({
				id: "gpt-4o-mini",
				provider: "openai",
				api: "openai-completions",
				baseUrl: "https://api.openai.com/v1",
			})),
			getPromptInfo: vi.fn(() => ({
				source: "stack",
				signature: "test-signature",
				layerCount: 1,
				missing: [],
			})),
			getMessages: vi.fn(() => []),
			prompt: vi.fn(),
			abort: vi.fn(),
		});

		const runtime = new PiRuntime(
			{
				provider: "openai",
				model: "gpt-4o-mini",
				apiKey: "test-key",
				maxSteps: 5,
				allowedTools: [],
				cwd: "/tmp",
			},
			[] as AgentTool[],
		);

		const events: string[] = [];
		runtime.onEvent((event) => {
			events.push(event.type === "status" ? event.message : event.type);
		});

		subscriber?.({
			type: "tool_execution_update",
			toolName: "bash",
			args: {},
		} as AgentEvent);

		expect(events).toEqual([]);
	});
});
