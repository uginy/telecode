import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import type { AgentTool } from "@earendil-works/pi-agent-core";
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

	it("persists complete user turns instead of cutting through a tool sequence", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "telecode-session-"));
		try {
			const runtime = createRuntimeDouble();
			const messages = [{ role: "user", content: "current task", timestamp: 0 }, ...Array.from({ length: 42 }, (_, index) => ({ role: "assistant", content: [{ type: "text", text: String(index) }] }))];
			runtime.getMessages = vi.fn(() => messages as never);
			runtime.prompt = vi.fn(async () => runtime.emit({ type: "done" }));
			createRuntimeMock.mockReturnValue({ runtime, engine: "pi" });
			const runner = new TaskRunner(vi.fn(), vi.fn(), 180_000, root);
			runner.initRuntime(createConfig(), []);
			await runner.runTask("current task");
			await vi.waitFor(async () => {
				const saved = JSON.parse(await fs.readFile(path.join(root, ".telecode/session.json"), "utf8"));
				expect(saved[0]).toEqual(messages[0]);
				expect(saved).toHaveLength(messages.length);
			});
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it("rejects an event-reported failure even when prompt resolves", async () => {
		const runtime = createRuntimeDouble();
		runtime.prompt = vi.fn(async () => {
			runtime.emit({ type: "error", message: "Invalid API key" });
			runtime.emit({ type: "done" });
		});
		createRuntimeMock.mockReturnValue({ runtime, engine: "pi" });
		const runner = new TaskRunner(vi.fn(), vi.fn());
		runner.initRuntime(createConfig(), []);
		await expect(runner.runTask("test")).rejects.toThrow("Invalid API key");
		expect(runner.currentState).toBe("error");
	});
});
