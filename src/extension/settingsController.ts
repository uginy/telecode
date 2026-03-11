import * as fs from "node:fs";
import * as vscode from "vscode";
import { readTelecodeSettings } from "../config/settings";
import type { ChatViewSettings, ChatViewProvider } from "../ui/chatViewProvider";
import { saveOpenSettingsFiles } from "../utils/vscodeUtils";

export async function persistChatViewSettings(
	settings: ChatViewSettings,
): Promise<{ sessionApiKey: string }> {
	const config = vscode.workspace.getConfiguration("telecode");
	const target = vscode.ConfigurationTarget.Global;
	const apiKey = settings.apiKey.trim();
	const telegramBotToken = settings.telegramBotToken.trim();

	await saveOpenSettingsFiles();

	await config.update("provider", settings.provider, target);
	await config.update("model", settings.model, target);
	await config.update("apiKey", apiKey, target);
	await config.update("baseUrl", settings.baseUrl, target);
	await config.update("maxSteps", settings.maxSteps, target);
	await config.update("logMaxChars", settings.logMaxChars, target);
	await config.update("channelLogLines", settings.channelLogLines, target);
	await config.update("statusVerbosity", settings.statusVerbosity, target);
	await config.update("safeModeProfile", settings.safeModeProfile, target);
	await config.update("responseStyle", settings.responseStyle, target);
	await config.update("language", settings.language, target);
	await config.update("uiLanguage", settings.uiLanguage, target);
	await config.update(
		"allowOutOfWorkspace",
		settings.safeModeProfile === "power",
		target,
	);
	await config.update("telegram.enabled", settings.telegramEnabled, target);
	await config.update("telegram.botToken", telegramBotToken, target);
	await config.update("telegram.chatId", settings.telegramChatId, target);
	await config.update("telegram.apiRoot", settings.telegramApiRoot, target);
	await config.update(
		"telegram.forceIPv4",
		settings.telegramForceIPv4,
		target,
	);
	await config.update("whatsapp.enabled", settings.whatsappEnabled, target);
	await config.update(
		"whatsapp.sessionPath",
		settings.whatsappSessionPath,
		target,
	);
	await config.update(
		"whatsapp.allowSelfCommands",
		settings.whatsappAllowSelfCommands,
		target,
	);
	await config.update(
		"whatsapp.accessMode",
		settings.whatsappAccessMode,
		target,
	);
	await config.update(
		"whatsapp.allowedPhones",
		settings.whatsappAllowedPhones,
		target,
	);

	return { sessionApiKey: apiKey };
}

export function syncSettingsToChatView(
	chatProvider: ChatViewProvider | null,
): void {
	const settings = readTelecodeSettings();
	const payload: ChatViewSettings = {
		provider: settings.agent.provider,
		model: settings.agent.model,
		apiKey: settings.agent.apiKey,
		baseUrl: settings.agent.baseUrl || "",
		maxSteps: settings.agent.maxSteps,
		logMaxChars: settings.agent.logMaxChars,
		channelLogLines: settings.agent.channelLogLines,
		statusVerbosity: settings.agent.statusVerbosity,
		safeModeProfile: settings.agent.safeModeProfile,
		responseStyle: settings.agent.responseStyle,
		language: settings.agent.language,
		uiLanguage: settings.agent.uiLanguage,
		allowOutOfWorkspace: settings.agent.allowOutOfWorkspace,
		telegramEnabled: settings.telegram.enabled,
		telegramBotToken: settings.telegram.botToken,
		telegramChatId: settings.telegram.chatId || "",
		telegramApiRoot: settings.telegram.apiRoot || "https://api.telegram.org",
		telegramForceIPv4: settings.telegram.forceIPv4,
		whatsappEnabled: settings.whatsapp.enabled,
		whatsappSessionPath:
			settings.whatsapp.sessionPath || "~/.telecode-ai/whatsapp-session.json",
		whatsappAllowSelfCommands: settings.whatsapp.allowSelfCommands,
		whatsappAccessMode: settings.whatsapp.accessMode,
		whatsappAllowedPhones: settings.whatsapp.allowedPhones.join(","),
	};

	chatProvider?.setSettings(payload);
}

export function syncBuildInfoToChatView(
	chatProvider: ChatViewProvider | null,
	options: {
		extensionVersion: string;
		bundleFilePath: string;
		now?: Date;
	},
): void {
	const loadedAt = (options.now || new Date()).toLocaleString();
	let builtAt = "unknown";

	try {
		const stat = fs.statSync(options.bundleFilePath);
		builtAt = stat.mtime.toLocaleString();
	} catch {
		// keep unknown
	}

	chatProvider?.setBuildInfo(
		`version=${options.extensionVersion}; build=${builtAt}; loaded=${loadedAt}`,
	);
}

export function notifySettingsViews(
	chatProvider: ChatViewProvider | null,
	message: string,
): void {
	chatProvider?.notify(message);
}
