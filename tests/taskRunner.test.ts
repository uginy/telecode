import { describe, it, expect, vi, afterEach } from "vitest";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { AgentRuntime, RuntimeConfig, RuntimeEvent } from "../src/engine/types";

const { createRuntimeMock } = vi.hoisted(() => ({
	createRuntimeMock: vi.fn(),
}));

vi.mock("../src/engine/createRuntime", () => ({
	createRuntime: createRuntimeMock,
}));

import { TaskRunner } from "../src/agent/taskRunner";

function createConfig(): RuntimeConfig {
	return {
		provider: "openai",
		model: "gpt-4o-mini",
		apiKey: "test-key",
		maxSteps: 5,
		allowedTools: [],
		cwd: "/tmp",
	};
}

function createRuntimeDouble(): AgentRuntime & {
	emit: (event: RuntimeEvent) => void;
	abort: ReturnType<typeof vi.fn>;
} {
	let listener: ((event: RuntimeEvent) => void) | null = null;

	const runtime: AgentRuntime & {
		emit: (event: RuntimeEvent) => void;
		abort: ReturnType<typeof vi.fn>;
	} = {
		engine: "pi",
		prompt: vi.fn(async () => new Promise<void>(() => {})),
		abort: vi.fn(),
		onEvent: vi.fn((next) => {
			listener = next;
			return () => {
				listener = null;
			};
		}),
		getMessages: vi.fn(() => []),
		emit: (event) => {
			listener?.(event);
		},
	};

	return runtime;
}

describe("TaskRunner", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it("keeps the error state when the watchdog aborts an inactive run", async () => {
		vi.useFakeTimers();

		const runtime = createRuntimeDouble();
		createRuntimeMock.mockReturnValue({ runtime, engine: "pi" });

		const states: string[] = [];
		const events: RuntimeEvent[] = [];
		const runner = new TaskRunner(
			(event) => events.push(event),
			(state) => states.push(state),
			1,
		);

		runner.initRuntime(createConfig(), [] as AgentTool[]);
		void runner.runTask("stalled task");

		await vi.advanceTimersByTimeAsync(10_000);

		expect(runtime.abort).toHaveBeenCalledTimes(1);
		expect(runner.currentState).toBe("error");
		expect(states).toEqual(["stopped", "running", "error"]);
		expect(events).toContainEqual({
			type: "error",
			message: "Task aborted due to inactivity (> 0.001s)",
		});
	});
});
