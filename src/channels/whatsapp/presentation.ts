import type { AgentSettings } from "../../config/settings";
import type { TaskReviewSummary } from "../../extension/taskReview";

export function renderWhatsappHelp(): string {
	return "Commands:\n/status — current state\n/review — last task summary\n/checks — run lint/build/test for last task\n/rerun — rerun last task prompt\n/resume — rerun last interrupted task\n/commit <message> — commit files from last task\n/revert — revert files from last task\n/stop — stop current run\n/run <task> — run a task (required in self-chat)";
}

export function renderWhatsappStatus(isProcessing: boolean): string {
	return isProcessing ? "Agent status: running" : "Agent status: ready";
}

export function renderWhatsappStartupMessage(
	settings: Pick<AgentSettings, "language" | "uiLanguage">,
): string {
	if (settings.language === "ru") {
		return "TeleCode AI подключен. Отправьте /status";
	}
	if (settings.language === "en") {
		return "TeleCode AI connected. Send /status";
	}
	return settings.uiLanguage === "en"
		? "TeleCode AI connected. Send /status"
		: "TeleCode AI подключен. Отправьте /status";
}

export function renderWhatsappTaskReview(result: TaskReviewSummary): string {
	const parts = [
		result.outcome === "completed"
			? "Last task completed"
			: result.outcome === "failed"
				? "Last task failed"
				: "Last task interrupted",
		result.summary,
		result.branch ? `Branch: ${result.branch}` : "Branch: -",
		`Prompt: ${result.prompt}`,
	];

	if (result.error) {
		parts.push(`Error: ${result.error}`);
	}

	if (result.changedFiles.length > 0) {
		parts.push(
			`Files: ${result.changedFiles
				.slice(0, 6)
				.map((file) => `${file.status}:${file.path}`)
				.join(", ")}`,
		);
	} else {
		parts.push("Files: no changes");
	}

	if (result.checks.length > 0) {
		parts.push(
			`Checks: ${result.checks
				.map(
					(check) =>
						`${check.label}:${check.status}${check.summary ? ` (${check.summary})` : ""}`,
				)
				.join(" • ")}`,
		);
	} else {
		parts.push("Checks: not run");
	}

	return parts.join("\n");
}
