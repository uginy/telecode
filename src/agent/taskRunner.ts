import { createRuntime } from "../engine/createRuntime";
import type {
	AgentRuntime,
	RuntimeConfig,
	RuntimeEvent,
	ImageContentExt,
} from "../engine/types";
import type { AgentTool, AgentMessage } from "@earendil-works/pi-agent-core";
import * as fs from "node:fs/promises";
import { readFileSync, unlinkSync } from "node:fs";
import * as path from "node:path";

export type TaskRunnerState = "idle" | "running" | "error" | "stopped";

/**
 * TaskRunner encapsulates the lifecycle of an AgentRuntime.
 * It manages starting, stopping, handling events, and the inactivity watchdog.
 * Fixes architectural duplication between extension.ts and telegram.ts.
 */
export class TaskRunner {
	private _runtime: AgentRuntime | null = null;
	private unsubscribeEvents: (() => void) | null = null;
	private state: TaskRunnerState = "idle";
	private lastActivityAt = 0;
	private runError: string | undefined;
	private watchdogTimer: NodeJS.Timeout | null = null;

	constructor(
		private readonly onEvent: (event: RuntimeEvent) => void,
		private readonly onStateChange: (state: TaskRunnerState) => void,
		/** Inactivity timeout in milliseconds (e.g. 180_000 for 3 minutes) */
		private readonly watchdogTimeoutMs = 180_000,
		private readonly workspaceRoot?: string,
	) {}

	public get currentState(): TaskRunnerState {
		return this.state;
	}

	public get runtime(): AgentRuntime | null {
		return this._runtime;
	}

	/**
	 * Initialize a new runtime instance without running a task yet.
	 */
	public initRuntime(config: RuntimeConfig, tools: AgentTool[]): AgentRuntime {
		this.abortCurrentRun();

		// Attempt to load previous session history
		const history = this.loadHistorySync();
		if (history) {
			config.initialMessages = history;
		}

		const created = createRuntime(config, tools);
		this._runtime = created.runtime;
		this.unsubscribeEvents = this._runtime.onEvent((e) => {
			this.lastActivityAt = Date.now();
			if (e.type === "error") this.runError = e.message;
			if (e.type === "done" && this.runError) return;
			if (e.type === "done" || e.type === "error") {
				this.stopWatchdog();
				this.setState(e.type === "error" ? "error" : "idle");
				this.saveHistoryAsync();
			}
			this.onEvent(e);
		});

		return this._runtime!;
	}

	/**
	 * Run a prompt (task) on the active runtime.
	 */
	public async runTask(
		prompt: string,
		images?: ImageContentExt[],
	): Promise<void> {
		if (!this._runtime) {
			throw new Error("Runtime not initialized");
		}
		if (this.state === "running") {
			throw new Error("Agent is already running a task.");
		}

		this.runError = undefined;
		const runtime = this._runtime;
		this.setState("running");
		this.lastActivityAt = Date.now();
		this.startWatchdog();

		try {
			await runtime.prompt(prompt, images);
			if (this.runError) throw new Error(this.runError);
			if (this._runtime !== runtime) throw new Error("Task interrupted.");
		} catch (e) {
			this.stopWatchdog();
			this.setState("error");
			throw e;
		}
	}

	/**
	 * Forcefully abort the current task.
	 */
	public abortCurrentRun(): void {
		this.disposeRuntime("stopped");
	}

	private disposeRuntime(finalState: TaskRunnerState): void {
		if (this._runtime) {
			this._runtime.abort();
		}
		this.stopWatchdog();

		if (this.unsubscribeEvents) {
			this.unsubscribeEvents();
			this.unsubscribeEvents = null;
		}
		this._runtime = null;
		this.setState(finalState);
	}

	private setState(newState: TaskRunnerState): void {
		if (this.state !== newState) {
			this.state = newState;
			this.onStateChange(newState);
		}
	}

	// --- Watchdog Mechanism ---

	private startWatchdog(): void {
		this.stopWatchdog();
		this.watchdogTimer = setInterval(() => {
			const inactiveForMs = Date.now() - this.lastActivityAt;
			if (this.state === "running" && inactiveForMs >= this.watchdogTimeoutMs) {
				this.runError = `Task aborted due to inactivity (> ${this.watchdogTimeoutMs / 1000}s)`;
				this.onEvent({ type: "error", message: this.runError });
				void this.saveHistoryAsync();
				this.disposeRuntime("error");
			}
		}, 10_000); // Check every 10 seconds
	}

	private stopWatchdog(): void {
		if (this.watchdogTimer) {
			clearInterval(this.watchdogTimer);
			this.watchdogTimer = null;
		}
	}

	// --- Persistent History ---
	private get historyFile(): string | null {
		if (!this.workspaceRoot) return null;
		return path.join(this.workspaceRoot, ".telecode", "session.json");
	}

	private loadHistorySync(): AgentMessage[] | null {
		const file = this.historyFile;
		if (!file) return null;

		try {
			const data = readFileSync(file, "utf-8");
			return JSON.parse(data) as AgentMessage[];
		} catch {
			return null;
		}
	}

	private async saveHistoryAsync(): Promise<void> {
		const file = this.historyFile;
		if (!file || !this._runtime?.getMessages) return;

		try {
			let msgs = this._runtime.getMessages();
			if (!msgs || msgs.length === 0) return;

			// Keep complete user turns so persisted history never starts with orphaned tool results.
			let start = Math.max(0, msgs.length - 40);
			while (start > 0 && msgs[start].role !== "user") start--;
			msgs = msgs.slice(start);

			const dir = path.dirname(file);
			await fs.mkdir(dir, { recursive: true });
			await fs.writeFile(file, JSON.stringify(msgs, null, 2), "utf-8");
		} catch {
			// fail silently
		}
	}

	public clearHistorySync(): void {
		const file = this.historyFile;
		if (!file) return;
		try {
			unlinkSync(file);
		} catch {
			// ignore if file doesn't exist
		}
	}
}
