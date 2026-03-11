import * as vscode from "vscode";
import type { ChatViewCommand } from "../ui/chatViewProvider";

export interface ChatCommandCallbacks {
	startAgent: () => Promise<void>;
	stopAgent: () => void;
	connectChannels: () => void;
	disconnectChannels: () => void;
	runTask: (prompt: string) => Promise<void>;
	openSettings: () => void;
	requestSettings: () => void;
	saveSettings: (command: Extract<ChatViewCommand, { command: "saveSettings" }>) => Promise<void>;
	fetchModels: (command: Extract<ChatViewCommand, { command: "fetchModels" }>) => Promise<void>;
}

export interface ExtensionCommandCallbacks {
	openChat: () => void;
	openSettings: () => void;
	startAgent: () => Promise<void>;
	promptTask: () => Promise<void>;
	stopAgent: () => void;
	resetSession: () => void;
	setResponseStyle: (style: string, successMessage: string) => Promise<void>;
	setLanguage: (language: string, successMessage: string) => Promise<void>;
}

export function createChatViewCommandHandler(
	callbacks: ChatCommandCallbacks,
): (command: ChatViewCommand) => Promise<void> {
	return async (command: ChatViewCommand) => {
		switch (command.command) {
			case "startAgent":
				await callbacks.startAgent();
				return;
			case "stopAgent":
				callbacks.stopAgent();
				return;
			case "connectChannels":
				callbacks.connectChannels();
				return;
			case "disconnectChannels":
				callbacks.disconnectChannels();
				return;
			case "runTask":
				await callbacks.runTask(command.prompt);
				return;
			case "openSettings":
				callbacks.openSettings();
				return;
			case "requestSettings":
				callbacks.requestSettings();
				return;
			case "saveSettings":
				await callbacks.saveSettings(command);
				return;
			case "fetchModels":
				await callbacks.fetchModels(command);
				return;
		}
	};
}

export function registerExtensionCommands(
	context: vscode.ExtensionContext,
	callbacks: ExtensionCommandCallbacks,
): void {
	context.subscriptions.push(
		vscode.commands.registerCommand("telecode.openChat", callbacks.openChat),
		vscode.commands.registerCommand(
			"telecode.openSettings",
			callbacks.openSettings,
		),
		vscode.commands.registerCommand("telecode.startAgent", callbacks.startAgent),
		vscode.commands.registerCommand("telecode.runTask", callbacks.promptTask),
		vscode.commands.registerCommand("telecode.stopAgent", callbacks.stopAgent),
		vscode.commands.registerCommand(
			"telecode.resetSession",
			callbacks.resetSession,
		),
		vscode.commands.registerCommand("telecode.setStyleShort", () =>
			callbacks.setResponseStyle(
				"concise",
				"TeleCode AI: Concise response style set.",
			),
		),
		vscode.commands.registerCommand("telecode.setStyleNormal", () =>
			callbacks.setResponseStyle(
				"normal",
				"TeleCode AI: Normal response style set.",
			),
		),
		vscode.commands.registerCommand("telecode.setStyleDetailed", () =>
			callbacks.setResponseStyle(
				"detailed",
				"TeleCode AI: Detailed response style set.",
			),
		),
		vscode.commands.registerCommand("telecode.setLanguageRu", () =>
			callbacks.setLanguage(
				"ru",
				"TeleCode AI: Agent language has been set to Russian.",
			),
		),
		vscode.commands.registerCommand("telecode.setLanguageEn", () =>
			callbacks.setLanguage(
				"en",
				"TeleCode AI: Agent language has been set to English.",
			),
		),
	);
}
