import type { TelecodeSettings } from "../../config/settings";
import type { Translations } from "../../services/i18n";
import type { TaskReviewSummary } from "../../extension/taskReview";
import { formatError } from "./utils";

export function renderTelegramStatus(options: {
	settings: TelecodeSettings;
	isProcessing: boolean;
	currentPhase: string;
	t: Translations;
}): string {
	const { settings, isProcessing, currentPhase, t } = options;
	const statusText = isProcessing
		? t.tg_status_running
		: currentPhase === "Error"
			? t.tg_status_error
			: t.tg_status_idle;

	return [
		`${t.tg_label_status}: ${statusText}`,
		`${t.tg_label_phase}: ${currentPhase}`,
		`${t.tg_label_provider}: ${settings.agent.provider}`,
		`${t.tg_label_model}: ${settings.agent.model}`,
		`${t.tg_label_style}: ${settings.agent.responseStyle}`,
		`${t.tg_label_language}: ${settings.agent.language}`,
	].join("\n");
}

export function renderTelegramSettings(
	settings: TelecodeSettings,
	t: Translations,
): string {
	return [
		`${t.tab_settings}:`,
		`- ${t.field_provider}: ${settings.agent.provider}`,
		`- ${t.field_model}: ${settings.agent.model}`,
		`- ${t.field_max_steps}: ${settings.agent.maxSteps}`,
		`- ${t.field_response_style}: ${settings.agent.responseStyle}`,
		`- ${t.field_language}: ${settings.agent.language}`,
		`- ${t.field_ui_language}: ${settings.agent.uiLanguage}`,
		`- Out of Workspace: ${settings.agent.allowOutOfWorkspace ? "YES" : "NO"}`,
	].join("\n");
}

export function renderTelegramHelp(t: Translations): string {
	return [
		t.tg_help_title,
		`/status - ${t.tg_cmd_status}`,
		`/settings - ${t.tg_cmd_settings}`,
		"/review - show last task summary",
		"/checks - run lint/build/test for last task",
		"/queue - show running and queued tasks",
		"/history [N] [status] [text] - filter recent tasks",
		"/task <id|last|active> - show task details",
		"/cancel <id> - cancel queued or running task",
		"/artifacts [id|last] - send task artifacts",
		"/schedule - list periodic tasks",
		"/schedule every <minutes> <task> - add periodic task",
		"/schedule pause|resume|remove|run <id> - manage schedule",
		"/rerun - rerun last task prompt",
		"/resume - rerun last interrupted task",
		"/commit <message> - commit files from last task",
		"/revert - revert files from last task",
		`/run <task> - ${t.tg_cmd_run}`,
		`/stop - ${t.tg_cmd_stop}`,
		`/last - ${t.tg_cmd_last}`,
		`/logs [N] - ${t.tg_cmd_logs}`,
		"/git <status|log [N]|show <ref>> - git tooling",
		`/changes - ${t.tg_cmd_changes}`,
		`/diff <file> - ${t.tg_cmd_diff}`,
		`/rollback - ${t.tg_cmd_rollback}`,
		`/provider <id> - ${t.tg_cmd_provider}`,
		`/model <id> - ${t.tg_cmd_model}`,
		`/help - ${t.tg_cmd_help}`,
	].join("\n");
}

export function renderTelegramTaskReview(result: TaskReviewSummary): string {
	const lines = [
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
		lines.push(`Error: ${result.error}`);
	}

	if (result.changedFiles.length > 0) {
		lines.push(
			"Files:",
			...result.changedFiles
				.slice(0, 8)
				.map((file) => `- ${file.status}: ${file.path}`),
		);
	} else {
		lines.push("Files: no changes");
	}

	if (result.checks.length > 0) {
		lines.push(
			"Checks:",
			...result.checks.map(
				(check) => `- ${check.label}: ${check.status}${check.summary ? ` (${check.summary})` : ""}`,
			),
		);
	} else {
		lines.push("Checks: not run");
	}

	return lines.join("\n");
}

export function parseTelegramRawApiCommand(raw: string): {
	method: string;
	params: Record<string, unknown>;
} {
	const input = raw.trim();
	const firstSpace = input.indexOf(" ");
	if (firstSpace === -1) {
		return { method: input, params: {} };
	}

	const method = input.slice(0, firstSpace).trim();
	const rawJson = input.slice(firstSpace + 1).trim();

	try {
		const params = rawJson ? JSON.parse(rawJson) : {};
		return { method, params };
	} catch (error) {
		throw new Error(`Invalid JSON params: ${formatError(error)}`, {
			cause: error,
		});
	}
}
