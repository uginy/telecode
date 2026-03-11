import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { RemoteChannelId } from "./remoteTasks";

export interface RemoteScheduleRecord {
	id: number;
	channel: RemoteChannelId;
	chatId: string;
	prompt: string;
	intervalMinutes: number;
	status: "active" | "paused";
	createdAt: string;
	nextRunAt: string;
	lastRunAt?: string;
	lastTaskId?: number;
}

interface RemoteScheduleState {
	nextId: number;
	schedules: RemoteScheduleRecord[];
}

interface RemoteScheduleExecutor {
	enqueuePrompt: (
		schedule: RemoteScheduleRecord,
	) => Promise<{ ok: boolean; taskId?: number; message?: string }>;
}

const STORE_DIR = ".telecode";
const STORE_FILE = "remote-schedules.json";
const MIN_INTERVAL_MINUTES = 5;
const TICK_MS = 30_000;

export class RemoteScheduleManager {
	private readonly executors = new Map<RemoteChannelId, RemoteScheduleExecutor>();
	private readonly timer: NodeJS.Timeout;
	private state: RemoteScheduleState | null = null;
	private chain = Promise.resolve();
	private tickInFlight = false;

	constructor(
		private readonly workspaceRoot: string,
		private readonly onLog?: (line: string) => void,
	) {
		this.timer = setInterval(() => {
			void this.tick();
		}, TICK_MS);
	}

	public dispose(): void {
		clearInterval(this.timer);
	}

	public registerExecutor(
		channel: RemoteChannelId,
		executor: RemoteScheduleExecutor,
	): void {
		this.executors.set(channel, executor);
	}

	public unregisterExecutor(channel: RemoteChannelId): void {
		this.executors.delete(channel);
	}

	public async list(options?: {
		channel?: RemoteChannelId;
		chatId?: string;
	}): Promise<RemoteScheduleRecord[]> {
		return this.withLock(async () => {
			await this.ensureLoaded();
			return this.state!.schedules
				.filter((item) => {
					if (options?.channel && item.channel !== options.channel) {
						return false;
					}
					if (options?.chatId && item.chatId !== options.chatId) {
						return false;
					}
					return true;
				})
				.sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))
				.map((item) => ({ ...item }));
		});
	}

	public async add(options: {
		channel: RemoteChannelId;
		chatId: string;
		prompt: string;
		intervalMinutes: number;
	}): Promise<RemoteScheduleRecord> {
		return this.withLock(async () => {
			await this.ensureLoaded();
			const intervalMinutes = Math.max(
				MIN_INTERVAL_MINUTES,
				Math.floor(options.intervalMinutes),
			);
			const now = new Date();
			const schedule: RemoteScheduleRecord = {
				id: this.state!.nextId++,
				channel: options.channel,
				chatId: options.chatId,
				prompt: options.prompt.trim(),
				intervalMinutes,
				status: "active",
				createdAt: now.toISOString(),
				nextRunAt: new Date(
					now.getTime() + intervalMinutes * 60_000,
				).toISOString(),
			};
			this.state!.schedules.push(schedule);
			await this.save();
			return { ...schedule };
		});
	}

	public async remove(id: number): Promise<boolean> {
		return this.withLock(async () => {
			await this.ensureLoaded();
			const before = this.state!.schedules.length;
			this.state!.schedules = this.state!.schedules.filter((item) => item.id !== id);
			const changed = this.state!.schedules.length !== before;
			if (changed) {
				await this.save();
			}
			return changed;
		});
	}

	public async pause(id: number): Promise<RemoteScheduleRecord | null> {
		return this.updateStatus(id, "paused");
	}

	public async resume(id: number): Promise<RemoteScheduleRecord | null> {
		return this.updateStatus(id, "active", true);
	}

	public async runNow(id: number): Promise<{
		ok: boolean;
		schedule?: RemoteScheduleRecord;
		taskId?: number;
		message?: string;
	}> {
		const schedule = await this.getById(id);
		if (!schedule) {
			return { ok: false, message: `Schedule #${id} not found.` };
		}
		const dispatched = await this.dispatchSchedule(schedule);
		return {
			ok: dispatched.ok,
			schedule: dispatched.schedule,
			taskId: dispatched.taskId,
			message: dispatched.message,
		};
	}

	private async getById(id: number): Promise<RemoteScheduleRecord | null> {
		return this.withLock(async () => {
			await this.ensureLoaded();
			const found = this.state!.schedules.find((item) => item.id === id);
			return found ? { ...found } : null;
		});
	}

	private async updateStatus(
		id: number,
		status: "active" | "paused",
		resetNextRun = false,
	): Promise<RemoteScheduleRecord | null> {
		return this.withLock(async () => {
			await this.ensureLoaded();
			const schedule = this.state!.schedules.find((item) => item.id === id);
			if (!schedule) {
				return null;
			}
			schedule.status = status;
			if (resetNextRun) {
				schedule.nextRunAt = new Date(
					Date.now() + schedule.intervalMinutes * 60_000,
				).toISOString();
			}
			await this.save();
			return { ...schedule };
		});
	}

	private async tick(): Promise<void> {
		if (this.tickInFlight) {
			return;
		}
		this.tickInFlight = true;
		try {
			const due = await this.withLock(async () => {
				await this.ensureLoaded();
				const now = Date.now();
				return this.state!.schedules
					.filter(
						(item) =>
							item.status === "active" &&
							new Date(item.nextRunAt).getTime() <= now,
					)
					.map((item) => ({ ...item }));
			});
			for (const schedule of due) {
				await this.dispatchSchedule(schedule);
			}
		} finally {
			this.tickInFlight = false;
		}
	}

	private async dispatchSchedule(schedule: RemoteScheduleRecord): Promise<{
		ok: boolean;
		schedule: RemoteScheduleRecord;
		taskId?: number;
		message?: string;
	}> {
		const executor = this.executors.get(schedule.channel);
		if (!executor) {
			this.onLog?.(
				`[schedule:warn] executor missing for ${schedule.channel}, schedule #${schedule.id}`,
			);
			await this.bumpNextRun(schedule.id);
			return {
				ok: false,
				schedule,
				message: `Channel ${schedule.channel} is not connected.`,
			};
		}

		const result = await executor.enqueuePrompt(schedule);
		await this.markRun(schedule.id, result.taskId);
		if (!result.ok) {
			this.onLog?.(
				`[schedule:warn] schedule #${schedule.id} enqueue failed: ${result.message || "unknown"}`,
			);
		}
		return {
			ok: result.ok,
			schedule: (await this.getById(schedule.id)) || schedule,
			taskId: result.taskId,
			message: result.message,
		};
	}

	private async markRun(id: number, taskId?: number): Promise<void> {
		await this.withLock(async () => {
			await this.ensureLoaded();
			const schedule = this.state!.schedules.find((item) => item.id === id);
			if (!schedule) {
				return;
			}
			schedule.lastRunAt = new Date().toISOString();
			schedule.nextRunAt = new Date(
				Date.now() + schedule.intervalMinutes * 60_000,
			).toISOString();
			schedule.lastTaskId = taskId;
			await this.save();
		});
	}

	private async bumpNextRun(id: number): Promise<void> {
		await this.markRun(id);
	}

	private async ensureLoaded(): Promise<void> {
		if (this.state) {
			return;
		}
		const loaded = await this.load();
		this.state =
			loaded || {
				nextId: 1,
				schedules: [],
			};
	}

	private async load(): Promise<RemoteScheduleState | null> {
		try {
			const raw = await fs.readFile(this.getStorePath(), "utf8");
			const parsed = JSON.parse(raw) as Partial<RemoteScheduleState>;
			if (
				typeof parsed.nextId !== "number" ||
				!Array.isArray(parsed.schedules)
			) {
				return null;
			}
			return {
				nextId: parsed.nextId,
				schedules: parsed.schedules as RemoteScheduleRecord[],
			};
		} catch {
			return null;
		}
	}

	private async save(): Promise<void> {
		if (!this.state) {
			return;
		}
		await fs.mkdir(path.join(this.workspaceRoot, STORE_DIR), { recursive: true });
		await fs.writeFile(
			this.getStorePath(),
			JSON.stringify(this.state, null, 2),
			"utf8",
		);
	}

	private getStorePath(): string {
		return path.join(this.workspaceRoot, STORE_DIR, STORE_FILE);
	}

	private async withLock<T>(run: () => Promise<T>): Promise<T> {
		const next = this.chain.then(run, run);
		this.chain = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	}
}

export function renderRemoteSchedules(schedules: RemoteScheduleRecord[]): string {
	if (schedules.length === 0) {
		return "No schedules.";
	}
	return [
		"Schedules:",
		...schedules.map((schedule) =>
			[
				`#${schedule.id}`,
				schedule.status,
				schedule.channel,
				`every ${schedule.intervalMinutes}m`,
				schedule.prompt.length > 60
					? `${schedule.prompt.slice(0, 57)}...`
					: schedule.prompt,
				`next=${schedule.nextRunAt}`,
				schedule.lastTaskId ? `lastTask=#${schedule.lastTaskId}` : "",
			]
				.filter((part) => part.length > 0)
				.join(" • "),
		),
	].join("\n");
}
