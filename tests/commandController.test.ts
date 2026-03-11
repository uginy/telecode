import { describe, expect, it, vi } from "vitest";
vi.mock("vscode", () => ({
	commands: {
		registerCommand: vi.fn(),
	},
}));

import { createChatViewCommandHandler } from "../src/extension/commandController";
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
