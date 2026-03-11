import { describe, expect, it, vi } from "vitest";
vi.mock("vscode", () => ({
	DiagnosticSeverity: {
		Error: 0,
		Warning: 1,
		Information: 2,
		Hint: 3,
	},
	Uri: {
		file: (fsPath: string) => ({ fsPath }),
	},
	workspace: {
		getConfiguration: () => ({
			get: () => undefined,
		}),
		workspaceFolders: [],
	},
	languages: {
		getDiagnostics: () => [],
	},
	commands: {
		executeCommand: vi.fn(),
	},
	window: {
		activeTextEditor: undefined,
	},
	env: {
		language: "en",
	},
}));

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { ensureChannelRuntime } from "../src/channels/runtime";
import type { AgentSettings } from "../src/config/settings";

function createSettings(): AgentSettings {
	return {
		provider: "openrouter",
		model: "model",
		apiKey: "secret",
		baseUrl: undefined,
		maxSteps: 100,
		allowedTools: ["Read", "Edit"],
		responseStyle: "concise",
		language: "ru",
		uiLanguage: "auto",
		allowOutOfWorkspace: false,
		logMaxChars: 1000,
		channelLogLines: 100,
		statusVerbosity: "normal",
		safeModeProfile: "balanced",
	};
}

describe("ensureChannelRuntime", () => {
	it("reuses runtime when signature matches", () => {
		const runtime = { id: "runtime" } as never;
		const taskRunner = {
			runtime,
			initRuntime: vi.fn(),
		} as never;
		const tools = [{ name: "Read" }] as AgentTool[];

		const first = ensureChannelRuntime({
			settings: createSettings(),
			tools,
			taskRunner,
			runtimeConfigSignature: "",
			workspaceRoot: "/tmp/workspace",
			onLog: vi.fn(),
			initLogLine: "[test] init",
		});
		const second = ensureChannelRuntime({
			settings: createSettings(),
			tools,
			taskRunner: {
				runtime: first.runtime,
				initRuntime: vi.fn(),
			} as never,
			runtimeConfigSignature: first.signature,
			workspaceRoot: "/tmp/workspace",
			onLog: vi.fn(),
			initLogLine: "[test] init",
		});

		expect(second.runtime).toBe(first.runtime);
	});

	it("initializes runtime when signature changes", () => {
		const createdRuntime = { id: "new-runtime" } as never;
		const initRuntime = vi.fn(() => createdRuntime);
		const onLog = vi.fn();

		const result = ensureChannelRuntime({
			settings: createSettings(),
			tools: [{ name: "Read" }] as AgentTool[],
			taskRunner: {
				runtime: { id: "old-runtime" },
				initRuntime,
			} as never,
			runtimeConfigSignature: "stale-signature",
			workspaceRoot: "/tmp/workspace",
			onLog,
			initLogLine: "[test] init",
		});

		expect(result.runtime).toBe(createdRuntime);
		expect(initRuntime).toHaveBeenCalledOnce();
		expect(onLog).toHaveBeenCalledWith("[test] init");
	});
});
