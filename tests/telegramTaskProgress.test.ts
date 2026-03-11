import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: () => ({
			get: () => undefined,
		}),
		workspaceFolders: [],
	},
	env: {
		language: "en",
	},
}));

import { TelegramTaskProgress } from "../src/channels/telegram/taskProgress";

describe("TelegramTaskProgress", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("throttles status updates and sends the latest text", async () => {
		vi.useFakeTimers();
		const editMessageText = vi.fn(async () => undefined);
		const ctx = {
			chat: { id: 123 },
			reply: vi.fn(async () => ({ message_id: 77 })),
			api: {
				editMessageText,
				sendChatAction: vi.fn(async () => undefined),
			},
		} as never;

		const progress = await TelegramTaskProgress.open(ctx, "Preparing");
		progress.schedule("First");
		progress.schedule("Second");

		await vi.advanceTimersByTimeAsync(4_000);

		expect(editMessageText).toHaveBeenCalledOnce();
		expect(editMessageText).toHaveBeenCalledWith(123, 77, "Second");
		progress.dispose();
	});
});
