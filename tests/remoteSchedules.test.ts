import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	RemoteScheduleManager,
	renderRemoteSchedules,
} from "../src/channels/remoteSchedules";

const managers: RemoteScheduleManager[] = [];

afterEach(() => {
	while (managers.length > 0) {
		managers.pop()?.dispose();
	}
});

describe("RemoteScheduleManager", () => {
	it("adds, updates and renders schedules", async () => {
		const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "telecode-schedule-"));
		const manager = new RemoteScheduleManager(workspaceRoot);
		managers.push(manager);

		const created = await manager.add({
			channel: "telegram",
			chatId: "1",
			prompt: "check repo",
			intervalMinutes: 1,
		});
		expect(created.intervalMinutes).toBe(1);

		const paused = await manager.pause(created.id);
		expect(paused?.status).toBe("paused");

		const resumed = await manager.resume(created.id);
		expect(resumed?.status).toBe("active");

		const list = await manager.list({ channel: "telegram", chatId: "1" });
		expect(renderRemoteSchedules(list)).toContain(`#${created.id}`);

		expect(await manager.remove(created.id)).toBe(true);
		expect(await manager.list({ channel: "telegram", chatId: "1" })).toEqual([]);
	});

	it("runs schedules through registered executor", async () => {
		const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "telecode-schedule-"));
		const manager = new RemoteScheduleManager(workspaceRoot);
		managers.push(manager);
		const prompts: string[] = [];

		manager.registerExecutor("whatsapp", {
			enqueuePrompt: async (schedule) => {
				prompts.push(schedule.prompt);
				return { ok: true, taskId: 33 };
			},
		});

		const created = await manager.add({
			channel: "whatsapp",
			chatId: "chat-1",
			prompt: "nightly sweep",
			intervalMinutes: 10,
		});
		const result = await manager.runNow(created.id);

		expect(result.ok).toBe(true);
		expect(result.taskId).toBe(33);
		expect(prompts).toEqual(["nightly sweep"]);
		const reloaded = await manager.list({ channel: "whatsapp", chatId: "chat-1" });
		expect(reloaded[0]?.lastTaskId).toBe(33);
	});

	it("persists paused schedules across reload", async () => {
		const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "telecode-schedule-"));
		const manager = new RemoteScheduleManager(workspaceRoot);
		managers.push(manager);

		const created = await manager.add({
			channel: "telegram",
			chatId: "chat-1",
			prompt: "check latest commit",
			intervalMinutes: 3,
		});
		await manager.pause(created.id);

		const reloaded = new RemoteScheduleManager(workspaceRoot);
		managers.push(reloaded);
		const schedules = await reloaded.list({ channel: "telegram", chatId: "chat-1" });

		expect(schedules).toHaveLength(1);
		expect(schedules[0]).toMatchObject({
			id: created.id,
			status: "paused",
			prompt: "check latest commit",
			intervalMinutes: 3,
		});
	});
});
