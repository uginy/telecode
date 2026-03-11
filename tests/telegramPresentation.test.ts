import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: () => ({
			get: () => undefined,
		}),
		workspaceFolders: [],
	},
	env: {
		language: "en",
	},
}));

import type { TelecodeSettings } from "../src/config/settings";
import type { Translations } from "../src/services/i18n";
import {
	parseTelegramRawApiCommand,
	renderTelegramHelp,
	renderTelegramSettings,
	renderTelegramStatus,
	renderTelegramTaskReview,
} from "../src/channels/telegram/presentation";

function createSettings(): TelecodeSettings {
	return {
		agent: {
			provider: "openrouter",
			model: "model-x",
			apiKey: "",
			baseUrl: undefined,
			maxSteps: 123,
			allowedTools: ["Read"],
			responseStyle: "concise",
			language: "ru",
			uiLanguage: "en",
			allowOutOfWorkspace: true,
			logMaxChars: 1000,
			channelLogLines: 100,
			statusVerbosity: "normal",
			safeModeProfile: "balanced",
		},
		telegram: {
			enabled: true,
			botToken: "",
			chatId: undefined,
			apiRoot: undefined,
			forceIPv4: true,
		},
		whatsapp: {
			enabled: false,
			sessionPath: "",
			allowSelfCommands: true,
			accessMode: "self",
			allowedPhones: [],
		},
	};
}

const t = {
	tg_status_running: "running",
	tg_status_error: "error",
	tg_status_idle: "idle",
	tg_label_status: "Status",
	tg_label_phase: "Phase",
	tg_label_provider: "Provider",
	tg_label_model: "Model",
	tg_label_style: "Style",
	tg_label_language: "Language",
	tab_settings: "Settings",
	field_provider: "Provider",
	field_model: "Model",
	field_max_steps: "Max steps",
	field_response_style: "Response style",
	field_language: "Language",
	field_ui_language: "UI language",
	tg_help_title: "Help",
	tg_cmd_status: "show status",
	tg_cmd_settings: "show settings",
	tg_cmd_run: "run task",
	tg_cmd_stop: "stop task",
	tg_cmd_last: "show last response",
	tg_cmd_logs: "show logs",
	tg_cmd_changes: "show changes",
	tg_cmd_diff: "show diff",
	tg_cmd_rollback: "rollback",
	tg_cmd_provider: "change provider",
	tg_cmd_model: "change model",
	tg_cmd_help: "show help",
} as Translations;

describe("telegram presentation", () => {
	it("renders status from runtime state and settings", () => {
		const text = renderTelegramStatus({
			settings: createSettings(),
			isProcessing: true,
			currentPhase: "Planning",
			t,
		});

		expect(text).toContain("Status: running");
		expect(text).toContain("Phase: Planning");
		expect(text).toContain("Provider: openrouter");
		expect(text).toContain("Model: model-x");
	});

	it("renders settings and help text", () => {
		expect(renderTelegramSettings(createSettings(), t)).toContain(
			"- Out of Workspace: YES",
		);
		expect(renderTelegramHelp(t)).toContain("/run <task> - run task");
		expect(renderTelegramHelp(t)).toContain("/review - show last task summary");
		expect(renderTelegramHelp(t)).toContain("/queue - show running and queued tasks");
		expect(renderTelegramHelp(t)).toContain("/history [N] - show recent tasks");
		expect(renderTelegramHelp(t)).toContain("/task <id> - show task details");
		expect(renderTelegramHelp(t)).toContain("/cancel <id> - cancel queued or running task");
		expect(renderTelegramHelp(t)).toContain("/rerun - rerun last task prompt");
		expect(renderTelegramHelp(t)).toContain("/resume - rerun last interrupted task");
	});

	it("renders task review summary", () => {
		const text = renderTelegramTaskReview({
			prompt: "refactor channel",
			outcome: "completed",
			summary: "Task completed • 2 files changed • Checks not run",
			completedAt: new Date().toISOString(),
			branch: "main",
			gitAvailable: true,
			hasChanges: true,
			canCommit: true,
			changedFiles: [
				{ path: "src/a.ts", status: "modified", rawStatus: " M" },
				{ path: "src/b.ts", status: "added", rawStatus: "A " },
			],
			checks: [],
		});

		expect(text).toContain("Last task completed");
		expect(text).toContain("Files:");
		expect(text).toContain("- modified: src/a.ts");
		expect(text).toContain("Checks: not run");
	});

	it("parses raw api command with json params", () => {
		expect(
			parseTelegramRawApiCommand('getChat {"chat_id":123,"full":true}'),
		).toEqual({
			method: "getChat",
			params: { chat_id: 123, full: true },
		});
	});

	it("throws for invalid json params", () => {
		expect(() =>
			parseTelegramRawApiCommand('getChat {"chat_id":123'),
		).toThrow("Invalid JSON params:");
	});
});
