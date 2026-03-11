import type { Context } from "grammy";
import { limitText } from "./utils";

const STATUS_THROTTLE_MS = 4_000;
const TYPING_INTERVAL_MS = 4_500;

export class TelegramTaskProgress {
	private lastEditTime = Date.now();
	private pendingFlush: NodeJS.Timeout | null = null;
	private pendingText = "";
	private typingInterval: NodeJS.Timeout | null = null;

	private constructor(
		private readonly client: TelegramProgressClient,
		private readonly chatId: number,
		public readonly messageId: number,
	) {}

	public static async open(
		ctx: Context,
		initialText: string,
	): Promise<TelegramTaskProgress> {
		const chatId = ctx.chat?.id;
		if (!chatId) {
			throw new Error("Telegram chat id is required for progress updates.");
		}
		const statusMessage = await ctx.reply(initialText);
		return new TelegramTaskProgress(
			{
				sendMessage: async (targetChatId, text) => {
					const message = await ctx.reply(text);
					if (targetChatId !== chatId) {
						throw new Error("Context reply cannot target a different chat.");
					}
					return message.message_id;
				},
				editMessage: async (targetChatId, messageId, text) => {
					await ctx.api.editMessageText(targetChatId, messageId, text);
				},
				sendTyping: async (targetChatId) => {
					await ctx.api.sendChatAction(targetChatId, "typing");
				},
			},
			chatId,
			statusMessage.message_id,
		);
	}

	public static async openForChat(
		client: TelegramProgressClient,
		chatId: number,
		initialText: string,
	): Promise<TelegramTaskProgress> {
		const messageId = await client.sendMessage(chatId, initialText);
		return new TelegramTaskProgress(client, chatId, messageId);
	}

	public schedule(text: string): void {
		this.pendingText = text;
		const gap = Date.now() - this.lastEditTime;
		if (gap >= STATUS_THROTTLE_MS) {
			void this.flush();
			return;
		}

		if (!this.pendingFlush) {
			this.pendingFlush = setTimeout(
				() => void this.flush(),
				STATUS_THROTTLE_MS - gap,
			);
		}
	}

	public startTyping(isActive: () => boolean): void {
		void this.sendTyping();
		this.typingInterval = setInterval(() => {
			if (!isActive()) {
				this.stopTyping();
				return;
			}
			void this.sendTyping();
		}, TYPING_INTERVAL_MS);
	}

	public dispose(): void {
		if (this.pendingFlush) {
			clearTimeout(this.pendingFlush);
			this.pendingFlush = null;
		}
		this.stopTyping();
	}

	private async flush(): Promise<void> {
		if (this.pendingFlush) {
			clearTimeout(this.pendingFlush);
			this.pendingFlush = null;
		}
		if (!this.pendingText) {
			return;
		}

		try {
			await this.client.editMessage(
				this.chatId,
				this.messageId,
				limitText(this.pendingText),
			);
			this.lastEditTime = Date.now();
			this.pendingText = "";
		} catch {
			// Ignore Telegram rate and edit conflicts for transient progress updates.
		}
	}

	private async sendTyping(): Promise<void> {
		try {
			await this.client.sendTyping(this.chatId);
		} catch {
			// Ignore transient typing update failures.
		}
	}

	private stopTyping(): void {
		if (this.typingInterval) {
			clearInterval(this.typingInterval);
			this.typingInterval = null;
		}
	}
}

interface TelegramProgressClient {
	sendMessage: (chatId: number, text: string) => Promise<number>;
	editMessage: (chatId: number, messageId: number, text: string) => Promise<void>;
	sendTyping: (chatId: number) => Promise<void>;
}
