import { describe, expect, it, vi } from "vitest";
const { registerCommand } = vi.hoisted(() => ({
	registerCommand: vi.fn(),
}));
vi.mock("vscode", () => ({
	commands: {
		registerCommand,
	},
}));

import {
	createChatViewCommandHandler,
	registerExtensionCommands,
} from "../src/extension/commandController";
import type { ChatViewCommand, ChatViewSettings } from "../src/ui/chatViewProvider";

function createSettings(): ChatViewSettings {
	return {
		provider: "openrouter",
		model: "model",
		apiKey: "",
		baseUrl: "",
		maxSteps: 100,
		responseStyle: "concise",
		language: "ru",
		uiLanguage: "auto",
		allowOutOfWorkspace: false,
		logMaxChars: 1000,
		channelLogLines: 100,
		statusVerbosity: "normal",
		safeModeProfile: "balanced",
		telegramEnabled: false,
		telegramBotToken: "",
		telegramChatId: "",
		telegramApiRoot: "https://api.telegram.org",
		telegramForceIPv4: true,
		whatsappEnabled: false,
		whatsappSessionPath: "~/.telecode-ai/",
		whatsappAllowSelfCommands: true,
		whatsappAccessMode: "self",
		whatsappAllowedPhones: "",
	};
}

describe("createChatViewCommandHandler", () => {
	it("routes commands to matching callbacks", async () => {
		const calls: string[] = [];
		const handler = createChatViewCommandHandler({
			startAgent: vi.fn(async () => calls.push("start")),
			stopAgent: vi.fn(() => calls.push("stop")),
			connectChannels: vi.fn(() => calls.push("connect")),
			disconnectChannels: vi.fn(() => calls.push("disconnect")),
			runTask: vi.fn(async (prompt: string) => calls.push(`run:${prompt}`)),
			openSettings: vi.fn(() => calls.push("openSettings")),
			requestSettings: vi.fn(() => calls.push("requestSettings")),
			requestTaskResult: vi.fn(() => calls.push("requestTaskResult")),
			saveSettings: vi.fn(async () => calls.push("saveSettings")),
			showTaskDiff: vi.fn(async () => calls.push("showTaskDiff")),
			runTaskChecks: vi.fn(async () => calls.push("runTaskChecks")),
			commitTaskChanges: vi.fn(async () => calls.push("commitTaskChanges")),
			revertTaskChanges: vi.fn(async () => calls.push("revertTaskChanges")),
			fetchModels: vi.fn(async () => calls.push("fetchModels")),
		});

		const commands: ChatViewCommand[] = [
			{ command: "startAgent" },
			{ command: "stopAgent" },
			{ command: "connectChannels" },
			{ command: "disconnectChannels" },
			{ command: "runTask", prompt: "refactor me" },
			{ command: "openSettings" },
			{ command: "requestSettings" },
			{ command: "requestTaskResult" },
			{ command: "saveSettings", settings: createSettings() },
			{ command: "showTaskDiff" },
			{ command: "runTaskChecks" },
			{ command: "commitTaskChanges" },
			{ command: "revertTaskChanges" },
			{
				command: "fetchModels",
				provider: "openrouter",
				baseUrl: "",
				apiKey: "secret",
			},
		];

		for (const command of commands) {
			await handler(command);
		}

		expect(calls).toEqual([
			"start",
			"stop",
			"connect",
			"disconnect",
			"run:refactor me",
			"openSettings",
			"requestSettings",
			"requestTaskResult",
			"saveSettings",
			"showTaskDiff",
			"runTaskChecks",
			"commitTaskChanges",
			"revertTaskChanges",
			"fetchModels",
		]);
	});
});

describe("registerExtensionCommands", () => {
	it("registers task review commands for command palette", () => {
		registerCommand.mockClear();
		registerExtensionCommands({ subscriptions: [] } as never, {
			openChat: vi.fn(),
			openSettings: vi.fn(),
			startAgent: vi.fn(async () => {}),
			promptTask: vi.fn(async () => {}),
			stopAgent: vi.fn(),
			resetSession: vi.fn(),
			showTaskDiff: vi.fn(async () => {}),
			runTaskChecks: vi.fn(async () => {}),
			commitTaskChanges: vi.fn(async () => {}),
			revertTaskChanges: vi.fn(async () => {}),
			setResponseStyle: vi.fn(async () => {}),
			setLanguage: vi.fn(async () => {}),
		});

		const ids = registerCommand.mock.calls.map((call) => call[0]);
		expect(ids).toContain("telecode.showTaskDiff");
		expect(ids).toContain("telecode.runTaskChecks");
		expect(ids).toContain("telecode.commitTaskChanges");
		expect(ids).toContain("telecode.revertTaskChanges");
	});
});
