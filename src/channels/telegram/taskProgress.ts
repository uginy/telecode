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
		private readonly ctx: Context,
		public readonly messageId: number,
	) {}

	public static async open(
		ctx: Context,
		initialText: string,
	): Promise<TelegramTaskProgress> {
		const statusMessage = await ctx.reply(initialText);
		return new TelegramTaskProgress(ctx, statusMessage.message_id);
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
		if (!this.ctx.chat?.id || !this.pendingText) {
			return;
		}

		try {
			await this.ctx.api.editMessageText(
				this.ctx.chat.id,
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
		if (!this.ctx.chat?.id) {
			return;
		}

		try {
			await this.ctx.api.sendChatAction(this.ctx.chat.id, "typing");
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
