import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	RemoteTaskManager,
	renderRemoteQueueSnapshot,
	renderRemoteTaskDetails,
	renderRemoteTaskHistory,
} from "../src/channels/remoteTasks";

describe("RemoteTaskManager", () => {
	it("starts first task immediately and queues the next one", async () => {
		const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "telecode-queue-"));
		const manager = new RemoteTaskManager(workspaceRoot);
		const started: number[] = [];

		manager.registerExecutor("telegram", {
			start: async (task) => {
				started.push(task.id);
			},
		});

		const first = await manager.enqueue({
			channel: "telegram",
			chatId: "1",
			prompt: "first task",
		});
		const second = await manager.enqueue({
			channel: "telegram",
			chatId: "1",
			prompt: "second task",
		});

		expect(first.started).toBe(true);
		expect(second.started).toBe(false);
		expect(started).toEqual([first.task.id]);

		const snapshot = await manager.getQueueSnapshot();
		expect(snapshot.active?.id).toBe(first.task.id);
		expect(snapshot.queued.map((task) => task.id)).toEqual([second.task.id]);
	});

	it("advances queue and records history after completion and cancellation", async () => {
		const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "telecode-queue-"));
		const manager = new RemoteTaskManager(workspaceRoot);
		const cancels: number[] = [];

		manager.registerExecutor("telegram", {
			start: async () => {},
			cancel: async (task) => {
				cancels.push(task.id);
			},
		});

		const first = await manager.enqueue({
			channel: "telegram",
			chatId: "1",
			prompt: "first",
		});
		const second = await manager.enqueue({
			channel: "telegram",
			chatId: "1",
			prompt: "second",
		});

		await manager.completeTask({
			id: first.task.id,
			status: "completed",
			summary: "ok",
			responsePreview: "done",
		});

		const activeAfterComplete = await manager.getQueueSnapshot();
		expect(activeAfterComplete.active?.id).toBe(second.task.id);

		const cancelRunning = await manager.cancelTask(second.task.id);
		expect(cancelRunning.ok).toBe(true);
		expect(cancels).toEqual([second.task.id]);

		await manager.completeTask({
			id: second.task.id,
			status: "interrupted",
			summary: "cancelled",
			error: "cancelled",
		});

		const history = await manager.getHistory(5);
		expect(history.map((task) => task.id)).toEqual([second.task.id, first.task.id]);
		expect(renderRemoteTaskHistory(history)).toContain(`#${second.task.id}`);
		expect(renderRemoteQueueSnapshot(await manager.getQueueSnapshot())).toContain(
			"Running: none",
		);
		expect(renderRemoteTaskDetails(history[0])).toContain("Status: interrupted");
	});

	it("recovers stale running tasks as interrupted on reload", async () => {
		const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "telecode-queue-"));
		const manager = new RemoteTaskManager(workspaceRoot);

		manager.registerExecutor("telegram", {
			start: async () => {},
		});

		const task = await manager.enqueue({
			channel: "telegram",
			chatId: "1",
			prompt: "recover me",
		});

		const reloaded = new RemoteTaskManager(workspaceRoot);
		const recoveredTask = await reloaded.getTask(task.task.id);
		expect(recoveredTask?.status).toBe("interrupted");
		expect(recoveredTask?.summary).toContain("restarted");
	});

	it("filters history and resolves last task selectors", async () => {
		const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "telecode-queue-"));
		const manager = new RemoteTaskManager(workspaceRoot);

		manager.registerExecutor("telegram", { start: async () => {} });

		const first = await manager.enqueue({
			channel: "telegram",
			chatId: "1",
			prompt: "fix tests",
			source: "schedule",
			scheduleId: 9,
		});
		await manager.completeTask({
			id: first.task.id,
			status: "failed",
			summary: "failed run",
		});

		const second = await manager.enqueue({
			channel: "telegram",
			chatId: "1",
			prompt: "update docs",
		});
		await manager.completeTask({
			id: second.task.id,
			status: "completed",
			summary: "docs ok",
		});

		const failed = await manager.getHistory({ status: "failed", text: "tests" });
		expect(failed.map((task) => task.id)).toEqual([first.task.id]);
		expect(await manager.findTask({ kind: "last", channel: "telegram", chatId: "1" })).toMatchObject({
			id: second.task.id,
		});
		expect(renderRemoteTaskDetails(failed[0])).toContain("Source: schedule #9");
	});

	it("scopes last task lookup by chat", async () => {
		const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "telecode-queue-"));
		const manager = new RemoteTaskManager(workspaceRoot);

		manager.registerExecutor("telegram", { start: async () => {} });

		const chatOne = await manager.enqueue({
			channel: "telegram",
			chatId: "chat-1",
			prompt: "task for first chat",
		});
		await manager.completeTask({
			id: chatOne.task.id,
			status: "completed",
			summary: "first done",
		});

		const chatTwo = await manager.enqueue({
			channel: "telegram",
			chatId: "chat-2",
			prompt: "task for second chat",
		});
		await manager.completeTask({
			id: chatTwo.task.id,
			status: "completed",
			summary: "second done",
		});

		expect(
			await manager.findTask({ kind: "last", channel: "telegram", chatId: "chat-1" }),
		).toMatchObject({ id: chatOne.task.id });
		expect(
			await manager.findTask({ kind: "last", channel: "telegram", chatId: "chat-2" }),
		).toMatchObject({ id: chatTwo.task.id });
	});
});
