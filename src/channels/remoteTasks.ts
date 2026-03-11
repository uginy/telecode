import * as fs from "node:fs/promises";
import * as path from "node:path";

export type RemoteChannelId = "telegram" | "whatsapp";
export type RemoteTaskStatus =
	| "queued"
	| "running"
	| "completed"
	| "failed"
	| "interrupted"
	| "cancelled";
export type RemoteTaskSource = "user" | "schedule";

export interface RemoteTaskArtifact {
	kind: "review" | "checks" | "files" | "diff";
	label: string;
	relativePath: string;
	fileName: string;
	mimeType: string;
}

export interface RemoteTaskRecord {
	id: number;
	channel: RemoteChannelId;
	chatId: string;
	prompt: string;
	source: RemoteTaskSource;
	scheduleId?: number;
	status: RemoteTaskStatus;
	createdAt: string;
	startedAt?: string;
	finishedAt?: string;
	summary?: string;
	error?: string;
	responsePreview?: string;
	artifacts?: RemoteTaskArtifact[];
	cancelRequested?: boolean;
}

export interface RemoteTaskHistoryQuery {
	limit?: number;
	status?: RemoteTaskStatus;
	channel?: RemoteChannelId;
	chatId?: string;
	text?: string;
}

interface RemoteTaskState {
	nextId: number;
	activeTaskId: number | null;
	tasks: RemoteTaskRecord[];
}

interface RemoteTaskExecutor {
	start: (task: RemoteTaskRecord) => Promise<void>;
	cancel?: (task: RemoteTaskRecord) => Promise<void> | void;
}

const STORE_DIR = ".telecode";
const STORE_FILE = "remote-tasks.json";
const MAX_HISTORY_ITEMS = 100;

export class RemoteTaskManager {
	private readonly executors = new Map<RemoteChannelId, RemoteTaskExecutor>();
	private state: RemoteTaskState | null = null;
	private chain = Promise.resolve();

	constructor(
		private readonly workspaceRoot: string,
		private readonly onLog?: (line: string) => void,
	) {}

	public registerExecutor(
		channel: RemoteChannelId,
		executor: RemoteTaskExecutor,
	): void {
		this.executors.set(channel, executor);
		void this.scheduleNext();
	}

	public unregisterExecutor(channel: RemoteChannelId): void {
		this.executors.delete(channel);
	}

	public async enqueue(options: {
		channel: RemoteChannelId;
		chatId: string;
		prompt: string;
		source?: RemoteTaskSource;
		scheduleId?: number;
	}): Promise<{ task: RemoteTaskRecord; started: boolean; position: number }> {
		let taskToStart: RemoteTaskRecord | null = null;
		const result = await this.withLock(async () => {
			await this.ensureLoaded();
			const now = new Date().toISOString();
			const task: RemoteTaskRecord = {
				id: this.state!.nextId++,
				channel: options.channel,
				chatId: options.chatId,
				prompt: options.prompt,
				source: options.source || "user",
				scheduleId: options.scheduleId,
				status: "queued",
				createdAt: now,
			};
			this.state!.tasks.push(task);
			const position = this.state!.tasks.filter((item) => item.status === "queued").length;
			taskToStart = this.pickNextTaskToStart();
			await this.save();
			return {
				task: { ...task },
				started: taskToStart?.id === task.id,
				position,
			};
		});

		if (taskToStart) {
			void this.dispatch(taskToStart);
		}
		return result;
	}

	public async completeTask(options: {
		id: number;
		status: Extract<RemoteTaskStatus, "completed" | "failed" | "interrupted">;
		summary?: string;
		error?: string;
		responsePreview?: string;
		artifacts?: RemoteTaskArtifact[];
	}): Promise<void> {
		let taskToStart: RemoteTaskRecord | null = null;
		await this.withLock(async () => {
			await this.ensureLoaded();
			const task = this.state!.tasks.find((item) => item.id === options.id);
			if (!task) {
				return;
			}

			task.status = options.status;
			task.summary = options.summary;
			task.error = options.error;
			task.responsePreview = options.responsePreview;
			task.artifacts = options.artifacts;
			task.finishedAt = new Date().toISOString();
			task.cancelRequested = false;
			if (this.state!.activeTaskId === task.id) {
				this.state!.activeTaskId = null;
			}
			this.trimHistory();
			taskToStart = this.pickNextTaskToStart();
			await this.save();
		});

		if (taskToStart) {
			void this.dispatch(taskToStart);
		}
	}

	public async cancelTask(id: number): Promise<{
		ok: boolean;
		message: string;
		cancelledTask?: RemoteTaskRecord;
	}> {
		let runningTask: RemoteTaskRecord | null = null;
		let executor: RemoteTaskExecutor | null = null;

		const result = await this.withLock(async () => {
			await this.ensureLoaded();
			const task = this.state!.tasks.find((item) => item.id === id);
			if (!task) {
				return { ok: false, message: `Task #${id} not found.` };
			}

			if (task.status === "queued") {
				task.status = "cancelled";
				task.finishedAt = new Date().toISOString();
				task.summary = "Cancelled before execution.";
				this.trimHistory();
				await this.save();
				return {
					ok: true,
					message: `Cancelled queued task #${task.id}.`,
					cancelledTask: { ...task },
				};
			}

			if (task.status === "running") {
				task.cancelRequested = true;
				runningTask = { ...task };
				executor = this.executors.get(task.channel) || null;
				await this.save();
				return {
					ok: true,
					message: `Cancellation requested for task #${task.id}.`,
					cancelledTask: { ...task },
				};
			}

			return {
				ok: false,
				message: `Task #${task.id} is already ${task.status}.`,
			};
		});

		const currentExecutor = executor as RemoteTaskExecutor | null;
		if (
			runningTask &&
			currentExecutor &&
			typeof currentExecutor.cancel === "function"
		) {
			await currentExecutor.cancel(runningTask);
		}

		return result;
	}

	public async getTask(id: number): Promise<RemoteTaskRecord | null> {
		return this.withLock(async () => {
			await this.ensureLoaded();
			const task = this.state!.tasks.find((item) => item.id === id);
			return task ? { ...task } : null;
		});
	}

	public async getQueueSnapshot(): Promise<{
		active: RemoteTaskRecord | null;
		queued: RemoteTaskRecord[];
	}> {
		return this.withLock(async () => {
			await this.ensureLoaded();
			const active = this.state!.tasks.find(
				(item) => item.id === this.state!.activeTaskId,
			);
			return {
				active: active ? { ...active } : null,
				queued: this.state!.tasks
					.filter((item) => item.status === "queued")
					.map((item) => ({ ...item })),
			};
		});
	}

	public async getHistory(
		query: number | RemoteTaskHistoryQuery = 10,
	): Promise<RemoteTaskRecord[]> {
		return this.withLock(async () => {
			await this.ensureLoaded();
			const normalized =
				typeof query === "number" ? { limit: query } : { ...query };
			const limit =
				typeof normalized.limit === "number" && normalized.limit > 0
					? normalized.limit
					: 10;
			return this.state!.tasks
				.filter((item) => matchesHistoryQuery(item, normalized))
				.sort((a, b) =>
					(b.finishedAt || b.createdAt).localeCompare(a.finishedAt || a.createdAt),
				)
				.slice(0, limit)
				.map((item) => ({ ...item }));
		});
	}

	public async findTask(options: {
		id?: number;
		kind?: "last" | "active";
		channel?: RemoteChannelId;
		chatId?: string;
	}): Promise<RemoteTaskRecord | null> {
		return this.withLock(async () => {
			await this.ensureLoaded();
			if (typeof options.id === "number") {
				const exact = this.state!.tasks.find((item) => item.id === options.id);
				return exact ? { ...exact } : null;
			}

			const channel = options.channel;
			const chatId = options.chatId;
			const filtered = this.state!.tasks.filter((item) => {
				if (channel && item.channel !== channel) {
					return false;
				}
				if (chatId && item.chatId !== chatId) {
					return false;
				}
				return true;
			});

			if (options.kind === "active") {
				const active = filtered.find((item) => item.status === "running");
				return active ? { ...active } : null;
			}

			const last = filtered
				.filter((item) => item.status !== "queued" && item.status !== "running")
				.sort((a, b) =>
					(b.finishedAt || b.createdAt).localeCompare(a.finishedAt || a.createdAt),
				)[0];
			return last ? { ...last } : null;
		});
	}

	private async scheduleNext(): Promise<void> {
		const nextTask = await this.withLock(async () => {
			await this.ensureLoaded();
			const taskToStart = this.pickNextTaskToStart();
			await this.save();
			return taskToStart;
		});
		if (nextTask) {
			void this.dispatch(nextTask);
		}
	}

	private async dispatch(task: RemoteTaskRecord): Promise<void> {
		const executor = this.executors.get(task.channel);
		if (!executor) {
			this.onLog?.(
				`[queue:warn] executor missing for ${task.channel}, task #${task.id} stays queued`,
			);
			await this.withLock(async () => {
				await this.ensureLoaded();
				const queuedTask = this.state!.tasks.find((item) => item.id === task.id);
				if (queuedTask?.status === "running") {
					queuedTask.status = "queued";
					queuedTask.startedAt = undefined;
					this.state!.activeTaskId = null;
					await this.save();
				}
			});
			return;
		}

		try {
			await executor.start(task);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.onLog?.(`[queue:error] task #${task.id} dispatch failed: ${message}`);
			await this.completeTask({
				id: task.id,
				status: "failed",
				error: message,
				summary: "Task failed before execution.",
			});
		}
	}

	private pickNextTaskToStart(): RemoteTaskRecord | null {
		if (!this.state || this.state.activeTaskId !== null) {
			return null;
		}

		const next = this.state.tasks.find((item) => item.status === "queued");
		if (!next) {
			return null;
		}

		next.status = "running";
		next.startedAt = new Date().toISOString();
		next.cancelRequested = false;
		this.state.activeTaskId = next.id;
		return { ...next };
	}

	private async ensureLoaded(): Promise<void> {
		if (this.state) {
			return;
		}

		const loaded = await this.load();
		if (loaded) {
			this.state = loaded;
		} else {
			this.state = {
				nextId: 1,
				activeTaskId: null,
				tasks: [],
			};
		}

		let changed = false;
		for (const task of this.state.tasks) {
			if (task.status === "running") {
				task.status = "interrupted";
				task.finishedAt = new Date().toISOString();
				task.summary = "Channel restarted before task completion.";
				task.error = "Remote channel restarted before task completion.";
				task.cancelRequested = false;
				changed = true;
			}
		}
		if (this.state.activeTaskId !== null) {
			this.state.activeTaskId = null;
			changed = true;
		}
		this.trimHistory();
		if (changed) {
			await this.save();
		}
	}

	private async load(): Promise<RemoteTaskState | null> {
		try {
			const raw = await fs.readFile(this.getStorePath(), "utf8");
			const parsed = JSON.parse(raw) as Partial<RemoteTaskState>;
			if (
				typeof parsed.nextId !== "number" ||
				!Array.isArray(parsed.tasks) ||
				(parsed.activeTaskId !== null && typeof parsed.activeTaskId !== "number")
			) {
				return null;
			}
			return {
				nextId: parsed.nextId,
				activeTaskId: parsed.activeTaskId ?? null,
				tasks: parsed.tasks as RemoteTaskRecord[],
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

	private trimHistory(): void {
		if (!this.state) {
			return;
		}

		const activeOrQueued = this.state.tasks.filter(
			(task) => task.status === "running" || task.status === "queued",
		);
		const finished = this.state.tasks
			.filter((task) => task.status !== "running" && task.status !== "queued")
			.sort((a, b) =>
				(b.finishedAt || b.createdAt).localeCompare(a.finishedAt || a.createdAt),
			)
			.slice(0, MAX_HISTORY_ITEMS);
		this.state.tasks = [...activeOrQueued, ...finished];
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

export function renderRemoteTaskLine(task: RemoteTaskRecord): string {
	const parts = [
		`#${task.id}`,
		task.status,
		task.channel,
		task.prompt.length > 70 ? `${task.prompt.slice(0, 67)}...` : task.prompt,
	];
	if (task.source === "schedule" && task.scheduleId) {
		parts.push(`schedule#${task.scheduleId}`);
	}
	if (task.cancelRequested) {
		parts.push("(cancelling)");
	}
	return parts.join(" • ");
}

export function renderRemoteTaskDetails(task: RemoteTaskRecord): string {
	const lines = [
		`Task #${task.id}`,
		`Status: ${task.status}${task.cancelRequested ? " (cancelling)" : ""}`,
		`Channel: ${task.channel}`,
		`Chat: ${task.chatId}`,
		`Prompt: ${task.prompt}`,
		`Created: ${task.createdAt}`,
	];
	if (task.startedAt) lines.push(`Started: ${task.startedAt}`);
	if (task.finishedAt) lines.push(`Finished: ${task.finishedAt}`);
	if (task.source === "schedule" && task.scheduleId) {
		lines.push(`Source: schedule #${task.scheduleId}`);
	}
	if (task.summary) lines.push(`Summary: ${task.summary}`);
	if (task.error) lines.push(`Error: ${task.error}`);
	if (task.responsePreview) lines.push(`Preview: ${task.responsePreview}`);
	if (task.artifacts && task.artifacts.length > 0) {
		lines.push(
			"Artifacts:",
			...task.artifacts.map(
				(artifact) => `- ${artifact.label}: ${artifact.relativePath}`,
			),
		);
	}
	return lines.join("\n");
}

export function renderRemoteQueueSnapshot(snapshot: {
	active: RemoteTaskRecord | null;
	queued: RemoteTaskRecord[];
}): string {
	const lines = ["Queue:"];
	lines.push(
		snapshot.active
			? `Running: ${renderRemoteTaskLine(snapshot.active)}`
			: "Running: none",
	);
	if (snapshot.queued.length === 0) {
		lines.push("Queued: none");
	} else {
		lines.push("Queued:");
		for (const task of snapshot.queued.slice(0, 10)) {
			lines.push(`- ${renderRemoteTaskLine(task)}`);
		}
	}
	return lines.join("\n");
}

export function renderRemoteTaskHistory(tasks: RemoteTaskRecord[]): string {
	if (tasks.length === 0) {
		return "No recent tasks.";
	}
	return ["Recent tasks:", ...tasks.map((task) => `- ${renderRemoteTaskLine(task)}`)].join(
		"\n",
	);
}

function matchesHistoryQuery(
	task: RemoteTaskRecord,
	query: RemoteTaskHistoryQuery,
): boolean {
	if (query.status) {
		if (task.status !== query.status) {
			return false;
		}
	} else if (task.status === "queued" || task.status === "running") {
		return false;
	}

	if (query.channel && task.channel !== query.channel) {
		return false;
	}

	if (query.chatId && task.chatId !== query.chatId) {
		return false;
	}

	if (query.text) {
		const needle = query.text.trim().toLowerCase();
		if (needle.length > 0) {
			const haystack = [
				task.prompt,
				task.summary || "",
				task.error || "",
				task.responsePreview || "",
			]
				.join("\n")
				.toLowerCase();
			if (!haystack.includes(needle)) {
				return false;
			}
		}
	}

	return true;
}
