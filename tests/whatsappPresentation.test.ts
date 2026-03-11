import { describe, expect, it } from "vitest";
import {
	renderWhatsappHelp,
	renderWhatsappStartupMessage,
	renderWhatsappStatus,
	renderWhatsappTaskReview,
} from "../src/channels/whatsapp/presentation";

describe("whatsapp presentation", () => {
	it("renders help and status text", () => {
		expect(renderWhatsappHelp()).toContain("/run <task>");
		expect(renderWhatsappHelp()).toContain("/review");
		expect(renderWhatsappHelp()).toContain("/rerun");
		expect(renderWhatsappHelp()).toContain("/resume");
		expect(renderWhatsappStatus(true)).toBe("Agent status: running");
		expect(renderWhatsappStatus(false)).toBe("Agent status: ready");
	});

	it("renders startup message by language preference", () => {
		expect(
			renderWhatsappStartupMessage({ language: "ru", uiLanguage: "en" }),
		).toContain("подключен");
		expect(
			renderWhatsappStartupMessage({ language: "en", uiLanguage: "ru" }),
		).toContain("connected");
		expect(
			renderWhatsappStartupMessage({ language: "auto", uiLanguage: "en" }),
		).toContain("connected");
	});

	it("renders task review summary", () => {
		const text = renderWhatsappTaskReview({
			prompt: "fix tests",
			outcome: "failed",
			error: "build failed",
			summary: "Task failed • 1 file changed • 1 failed",
			completedAt: new Date().toISOString(),
			branch: "main",
			gitAvailable: true,
			hasChanges: true,
			canCommit: true,
			changedFiles: [{ path: "src/app.ts", status: "modified", rawStatus: " M" }],
			checks: [
				{ id: "build", label: "Build", status: "failed", summary: "exit 1" },
			],
		});

		expect(text).toContain("Last task failed");
		expect(text).toContain("Files: modified:src/app.ts");
		expect(text).toContain("Checks: Build:failed (exit 1)");
	});
});
