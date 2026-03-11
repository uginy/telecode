import type { TelecodeSettings } from "../../config/settings";
import type { Translations } from "../../services/i18n";
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
		`/run <task> - ${t.tg_cmd_run}`,
		`/stop - ${t.tg_cmd_stop}`,
		`/last - ${t.tg_cmd_last}`,
		`/logs [N] - ${t.tg_cmd_logs}`,
		`/changes - ${t.tg_cmd_changes}`,
		`/diff <file> - ${t.tg_cmd_diff}`,
		`/rollback - ${t.tg_cmd_rollback}`,
		`/provider <id> - ${t.tg_cmd_provider}`,
		`/model <id> - ${t.tg_cmd_model}`,
		`/help - ${t.tg_cmd_help}`,
	].join("\n");
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
