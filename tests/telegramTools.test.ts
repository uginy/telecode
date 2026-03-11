import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [
			{
				uri: { fsPath: "/test/workspace" },
			},
		],
		getConfiguration: () => ({
			get: () => undefined,
		}),
	},
	env: {
		language: "en",
	},
}));

import { createTelegramTools } from "../src/channels/telegram/tools";

describe("createTelegramTools", () => {
	let tempDir = "";

	afterEach(async () => {
		vi.restoreAllMocks();
		if (tempDir) {
			await fs.rm(tempDir, { recursive: true, force: true });
			tempDir = "";
		}
	});

	it("reads the active chat id at execution time", async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "telecode-tg-tools-"));
		const filePath = path.join(tempDir, "artifact.txt");
		await fs.writeFile(filePath, "hello", "utf8");

		let currentChatId = 111;
		const apiService = {
			toInputFile: vi.fn(async () => ({ mock: "file" })),
			callApi: vi.fn(async () => ({ ok: true })),
		};

		const tools = createTelegramTools(
			apiService as never,
			() => currentChatId,
			tempDir,
			() => {},
		);
		const sendFileTool = tools.find((tool) => tool.name === "telegram_send_file");
		expect(sendFileTool).toBeDefined();

		currentChatId = 222;
		const result = await sendFileTool!.execute("call-1", {
			path: filePath,
		});

		expect(apiService.callApi).toHaveBeenCalledWith(
			"sendDocument",
			expect.objectContaining({ chat_id: 222 }),
		);
		expect(result.details).toEqual(
			expect.objectContaining({ path: filePath, archived: false }),
		);
	});
});
