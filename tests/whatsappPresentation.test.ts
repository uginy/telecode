import { describe, expect, it } from "vitest";
import {
	renderWhatsappHelp,
	renderWhatsappStartupMessage,
	renderWhatsappStatus,
	renderWhatsappTaskReviewCompact,
	renderWhatsappTaskReview,
} from "../src/channels/whatsapp/presentation";

describe("whatsapp presentation", () => {
	it("renders help and status text", () => {
		expect(renderWhatsappHelp()).toContain("/run <task>");
		expect(renderWhatsappHelp()).toContain("/review");
		expect(renderWhatsappHelp()).toContain("/memory");
		expect(renderWhatsappHelp()).toContain("/remember <note>");
		expect(renderWhatsappHelp()).toContain("/forget");
		expect(renderWhatsappHelp()).toContain("/queue");
		expect(renderWhatsappHelp()).toContain("/history [N] [status] [text]");
		expect(renderWhatsappHelp()).toContain("/task <id|last|active>");
		expect(renderWhatsappHelp()).toContain("/cancel <id>");
		expect(renderWhatsappHelp()).toContain("/artifacts [id|last]");
		expect(renderWhatsappHelp()).toContain("/schedule every <minutes> <task>");
		expect(renderWhatsappHelp()).toContain("/git <status|log [N]|show <ref>>");
		expect(renderWhatsappHelp()).toContain("/logs [N]");
		expect(renderWhatsappHelp()).toContain("/changes");
		expect(renderWhatsappHelp()).toContain("/diff <path>");
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

	it("renders compact task review summary", () => {
		const text = renderWhatsappTaskReviewCompact({
			prompt: "fix tests",
			outcome: "completed",
			summary: "Task completed • 1 file changed • Checks not run",
			completedAt: new Date().toISOString(),
			branch: "main",
			gitAvailable: true,
			hasChanges: true,
			canCommit: true,
			changedFiles: [{ path: "src/app.ts", status: "modified", rawStatus: " M" }],
			checks: [],
		});

		expect(text).toContain("Last task completed");
		expect(text).toContain("Use /review for details.");
		expect(text).not.toContain("Prompt:");
		expect(text).not.toContain("Branch:");
	});
});
