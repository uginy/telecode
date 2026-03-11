import type { AgentSettings } from "../../config/settings";

export function renderWhatsappHelp(): string {
	return "Commands:\n/status — current state\n/stop — stop current run\n/run <task> — run a task (required in self-chat)";
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
