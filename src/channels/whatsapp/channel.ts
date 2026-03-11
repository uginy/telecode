import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import * as QRCode from "qrcode";
import {
	DisconnectReason,
	makeWASocket,
	useMultiFileAuthState,
	fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { createTaskRunner } from "../../agent/runtimeSession";
import type { TaskRunner } from "../../agent/taskRunner";
import type { AgentRuntime, RuntimeEvent } from "../../engine/types";
import { readTelecodeSettings } from "../../config/settings";
import type { IChannel } from "../types";
import { ensureChannelRuntime } from "../runtime";
import {
	extractWhatsappMessageId,
	extractWhatsappMessageText,
	normalizeWhatsappMessageText,
	parseWhatsappCommand,
	splitWhatsappText,
	summarizeWhatsappToolPayload,
	type BaileysMessage,
} from "./messageUtils";
import {
	renderWhatsappHelp,
	renderWhatsappStartupMessage,
	renderWhatsappStatus,
	renderWhatsappTaskReviewCompact,
	renderWhatsappTaskReview,
} from "./presentation";
import { isWhatsappSenderAllowed } from "./access";
import {
	collectTaskReviewSummary,
	collectWorkspaceChangedFiles,
	commitTaskFiles,
	didTaskChangeFiles,
	loadTaskReviewSummary,
	revertTaskFiles,
	runWorkspaceChecks,
	saveTaskReviewSummary,
	shouldSendAutomaticTaskReview,
	type TaskReviewSummary,
} from "../../extension/taskReview";
import { createTaskArtifacts } from "../../extension/taskArtifacts";
import {
	appendProjectMemoryNote,
	clearProjectMemory,
	loadProjectMemory,
} from "../../projectMemory";
import {
	type RemoteTaskManager,
	type RemoteTaskRecord,
	renderRemoteQueueSnapshot,
	renderRemoteTaskDetails,
	renderRemoteTaskHistory,
} from "../remoteTasks";
import type { RemoteScheduleManager } from "../remoteSchedules";
import { renderRemoteSchedules } from "../remoteSchedules";
import { parseHistoryArgs, parseScheduleCommand, parseTaskSelector } from "../remoteCommandArgs";
import { executeRemoteGitCommand, renderRemoteGitStatus } from "../remoteGit";
import { runGitCommand } from "../telegram/utils";

const WA_BOT_PREFIX = "[Bot] ";

function expandHome(inputPath: string): string {
	if (!inputPath.startsWith("~")) return inputPath;
	return path.join(os.homedir(), inputPath.slice(1));
}

async function ensureDir(dir: string): Promise<void> {
	await fs.mkdir(dir, { recursive: true });
}

function parseIdCommand(body: string): number | null {
	const value = body.split(/\s+/, 2)[1];
	if (!value) {
		return null;
	}
	const id = Number.parseInt(value.trim(), 10);
	return Number.isFinite(id) ? id : null;
}

function parseCountCommand(body: string, fallback: number, max: number): number {
	const value = body.split(/\s+/, 2)[1];
	if (!value) {
		return fallback;
	}
	const count = Number.parseInt(value.trim(), 10);
	return Number.isFinite(count) && count > 0 ? Math.min(count, max) : fallback;
}

export class WhatsAppChannel implements IChannel {
	public readonly id = "whatsapp";
	public readonly name = "WhatsApp";

	private sock: ReturnType<typeof makeWASocket> | null = null;
	private active = false;
	private isProcessing = false;
	private authLogged = false;
	private startupWatchdog: NodeJS.Timeout | null = null;
	private reconnectTimer: NodeJS.Timeout | null = null;
	private destroyInFlight: Promise<void> | null = null;
	private runtimeConfigSignature = "";
	private readonly logs: string[] = [];
	private readonly seenMessageIds = new Map<string, number>();
	private readonly seenIncomingFingerprints = new Map<string, number>();
	private readonly recentOutgoingTexts = new Map<string, number>();
	private startupGreetingSent = false;
	private currentChatId: string | null = null;
	private reconnectAttempts = 0;
	private readonly maxReconnectAttempts = 5;
	private lastTaskReview: TaskReviewSummary | null = null;
	private activeRemoteTaskId: number | null = null;
	private stopRequestedTaskId: number | null = null;
	private readonly usage = {
		task: "Usage: /task <id|last|active>",
		cancel: "Usage: /cancel <id>",
		artifacts: "Usage: /artifacts [id|last|active]",
		schedule:
			"Usage: /schedule | /schedule every <minutes> <task> | /schedule pause|resume|remove|run <id>",
		diff: "Usage: /diff <relative-file-path>",
		commit: "Usage: /commit <message>",
		remember: "Usage: /remember <note>",
		run: "Usage: /run <task>",
	};

	private taskRunner: TaskRunner;

	constructor(
		private readonly tools: AgentTool[],
		private readonly workspaceRoot: string,
		private readonly remoteTasks: RemoteTaskManager,
		private readonly remoteSchedules: RemoteScheduleManager,
		private readonly onLog?: (line: string) => void,
		private readonly onStatus?: (status: string) => void,
	) {
		this.taskRunner = createTaskRunner({
			onEvent: () => {
				// event streaming is handled per task subscription
			},
			onStateChange: (state) => {
				if (state === "error" || state === "idle" || state === "stopped") {
					this.isProcessing = false;
				}
			},
			watchdogTimeoutMs: 180_000,
			workspaceRoot: this.workspaceRoot,
		});
	}

	public isActive(): boolean {
		return this.active;
	}

	public async start(): Promise<void> {
		this.stop();
		if (this.destroyInFlight) {
			await this.destroyInFlight;
		}
		this.startupGreetingSent = false;
		this.reconnectAttempts = 0;

		const settings = readTelecodeSettings();
		if (!settings.whatsapp.enabled) {
			this.pushLog("[whatsapp] disabled");
			this.setStatus("Idle");
			return;
		}

		const sessionPath = expandHome(settings.whatsapp.sessionPath);
		this.lastTaskReview = await loadTaskReviewSummary(this.workspaceRoot);
		const sessionDir = path.join(
			path.extname(sessionPath) ? path.dirname(sessionPath) : sessionPath,
			"baileys-auth",
		);
		await ensureDir(sessionDir);

		try {
			const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
			const { version } = await fetchLatestBaileysVersion();

			this.sock = makeWASocket({
				auth: state,
				version,
				printQRInTerminal: true,
				browser: ["TeleCode", "Chrome", "1.0.0"],
				logger: require("pino")({ level: "silent" }) as any,
			});

			this.sock.ev.on("creds.update", saveCreds);

			const localSock = this.sock;

			this.sock.ev.on(
				"connection.update",
				(update: {
					connection?: string;
					lastDisconnect?: { error?: Error };
					qr?: string;
				}) => {
					const { connection, lastDisconnect, qr } = update;

					if (this.sock && this.sock !== localSock) return; // ignore events from disposed overlapping instances

					if (qr) {
						this.clearStartupWatchdog();
						this.setStatus("Connecting");
						this.authLogged = false;
						this.pushLog(
							"[whatsapp] scan QR in your terminal to authorize WhatsApp session",
						);
						void this.emitQrToLogs(qr);
					}

					if (connection === "open") {
						this.clearStartupWatchdog();
						this.active = true;
						this.remoteTasks.registerExecutor("whatsapp", {
							start: async (task) => {
								await this.runQueuedTask(task);
							},
							cancel: (task) => {
								if (task.id === this.activeRemoteTaskId) {
									this.stopRequestedTaskId = task.id;
									this.stopCurrentTask();
								}
							},
						});
						this.remoteSchedules.registerExecutor("whatsapp", {
							enqueuePrompt: async (schedule) =>
								this.enqueueScheduledTaskRequest(
									schedule.chatId,
									schedule.prompt,
									schedule.id,
								),
						});
						this.reconnectAttempts = 0;
						this.setStatus("Ready");
						this.pushLog("[whatsapp] client ready");
						if (!this.authLogged) {
							this.authLogged = true;
							this.pushLog("[whatsapp] authenticated");
						}
						setTimeout(() => {
							void this.sendStartupGreeting();
						}, 700);
					}

					if (connection === "close") {
						this.remoteTasks.unregisterExecutor("whatsapp");
						this.remoteSchedules.unregisterExecutor("whatsapp");
						const statusCode = (lastDisconnect?.error as Boom)?.output
							?.statusCode;
						const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

						this.clearStartupWatchdog();
						this.active = false;
						this.setStatus("Idle");

						// If sock is null, it means stop() was intentionally called.
						if (!this.sock) {
							return;
						}

						if (
							shouldReconnect &&
							this.reconnectAttempts < this.maxReconnectAttempts
						) {
							this.reconnectAttempts++;
							this.pushLog(
								`[whatsapp] disconnected: ${lastDisconnect?.error}, reconnecting (attempt ${this.reconnectAttempts})`,
							);
							this.reconnectTimer = setTimeout(() => {
								void this.start();
							}, 3000);
						} else if (statusCode === DisconnectReason.loggedOut) {
							this.pushLog("[whatsapp] logged out from WhatsApp");
						} else {
							this.pushLog(
								`[whatsapp] disconnected: ${
									lastDisconnect?.error || "unknown"
								}`,
							);
						}
					}
				},
			);

			this.sock.ev.on(
				"messages.upsert",
				async (upsert: { messages: BaileysMessage[]; type: string }) => {
					if (this.sock !== localSock) return;
					const { messages, type } = upsert;
					if (type === "notify") {
						for (const msg of messages) {
							await this.handleMessage(msg);
						}
					}
				},
			);

			this.setStatus("Connecting");
			this.pushLog(`[whatsapp] starting (sessionDir=${sessionDir})`);
			this.pushLog("[whatsapp] initializing Baileys client...");
			this.startupWatchdog = setTimeout(() => {
				if (!this.active) {
					this.pushLog("[whatsapp:warn] still waiting for QR/ready");
				}
			}, 12_000);
		} catch (error) {
			this.clearStartupWatchdog();
			const message = error instanceof Error ? error.message : String(error);
			this.pushLog(`[whatsapp:error] initialize failed: ${message}`);
			this.setStatus("Error");
			this.sock = null;
		}
	}

	public stop(): void {
		this.remoteTasks.unregisterExecutor("whatsapp");
		this.remoteSchedules.unregisterExecutor("whatsapp");
		const current = this.sock;
		this.sock = null; // Important: prevents reconnect in 'close' event
		this.active = false;
		this.isProcessing = false;
		this.authLogged = false;
		this.startupGreetingSent = false;
		this.clearStartupWatchdog();
		this.clearReconnectTimer();
		this.currentChatId = null;
		this.runtimeConfigSignature = "";
		this.taskRunner.abortCurrentRun();
		this.setStatus("Idle");

		if (current) {
			const destroyPromise = (async () => {
				try {
					current.end(undefined);
				} catch {
					// ignore shutdown errors
				}
			})().finally(() => {
				if (this.destroyInFlight === destroyPromise) {
					this.destroyInFlight = null;
				}
			});
			this.destroyInFlight = destroyPromise as Promise<void>;
			this.pushLog("[whatsapp] stopped");
		}
	}

	public stopCurrentTask(): void {
		if (!this.isProcessing) return;
		if (this.activeRemoteTaskId !== null && this.stopRequestedTaskId === null) {
			this.stopRequestedTaskId = this.activeRemoteTaskId;
		}
		this.taskRunner.abortCurrentRun();
		this.isProcessing = false;
		this.setStatus("Idle");
		this.pushLog("[whatsapp] current task stopped");
	}

	// ---------------------------------------------------------------------------
	// Message handling
	// ---------------------------------------------------------------------------

	private async handleMessage(msg: BaileysMessage): Promise<void> {
		const settings = readTelecodeSettings();
		const chatId = msg.key?.remoteJid || null;
		const body = extractWhatsappMessageText(msg);
		const fromMe = msg.key?.fromMe === true;
		const command = parseWhatsappCommand(body);
		const messageId = extractWhatsappMessageId(msg);

		if (!chatId || !body) {
			// Baileys sends many protocol/system events without a text body (e.g. read receipts, images, system status).
			// We quietly ignore non-text messages to prevent log spam.
			return;
		}

		if (
			!isWhatsappSenderAllowed({
				mode: settings.whatsapp.accessMode,
				allowedPhones: settings.whatsapp.allowedPhones,
				fromMe,
				msg: msg as never,
				chatId,
			})
		) {
			this.pushLog("[whatsapp] blocked message by access policy");
			return;
		}

		this.currentChatId = chatId;
		void this.saveLastChatId(chatId);

		if (body.includes(WA_BOT_PREFIX.trim())) {
			return;
		}
		if (messageId && this.isDuplicateMessage(messageId)) {
			return;
		}
		if (this.isDuplicateIncomingText(chatId, body)) {
			return;
		}
		// Critical anti-loop guard: in some event paths bot messages can be
		// re-emitted as if they were incoming. Ignore anything that matches a
		// recent outgoing message payload.
		if (this.isLikelyOwnOutgoing(body)) {
			return;
		}

		// Prevent self-chat loops, but allow plain-text self messages if they are
		// not generated by the bot itself.
		if (fromMe && !settings.whatsapp.allowSelfCommands) {
			return;
		}
		if (fromMe && !command && this.isLikelyOwnOutgoing(body)) {
			return;
		}

		if (command === "help") {
			await this.sendMessageSafe(chatId, renderWhatsappHelp(), "/help");
			return;
		}

		if (command === "status") {
			await this.sendMessageSafe(
				chatId,
				renderWhatsappStatus(this.isProcessing),
				"/status",
			);
			return;
		}

		if (command === "review") {
			await this.sendMessageSafe(
				chatId,
				this.lastTaskReview
					? renderWhatsappTaskReview(this.lastTaskReview)
					: "No completed runs yet.",
				"/review",
			);
			return;
		}

		if (command === "memory") {
			const memory = await loadProjectMemory(this.workspaceRoot);
			await this.sendMessageSafe(
				chatId,
				memory || "Project memory is empty.",
				"/memory",
			);
			return;
		}

		if (command === "remember") {
			const note = body.replace(/^\/remember\s*/i, "").trim();
			if (!note) {
				await this.sendMessageSafe(chatId, this.usage.remember, "/remember");
				return;
			}
			await appendProjectMemoryNote(this.workspaceRoot, note);
			await this.sendMessageSafe(chatId, "Project memory updated.", "/remember");
			return;
		}

		if (command === "forget") {
			await clearProjectMemory(this.workspaceRoot);
			await this.sendMessageSafe(chatId, "Project memory cleared.", "/forget");
			return;
		}

		if (command === "checks") {
			if (!this.lastTaskReview) {
				await this.sendMessageSafe(chatId, "No completed runs yet.", "/checks");
				return;
			}
			await this.sendMessageSafe(chatId, "Running checks for last task...", "/checks");
			const checks = await runWorkspaceChecks(this.workspaceRoot);
			await this.setLastTaskReview(await collectTaskReviewSummary({
				workspaceRoot: this.workspaceRoot,
				prompt: this.lastTaskReview.prompt,
				outcome: this.lastTaskReview.outcome,
				error: this.lastTaskReview.error,
				checks,
			}));
			const updatedReview = this.lastTaskReview;
			if (!updatedReview) {
				return;
			}
			for (const chunk of splitWhatsappText(
				renderWhatsappTaskReview(updatedReview),
			)) {
				await this.sendMessageSafe(chatId, chunk, "/checks");
			}
			return;
		}

		if (command === "queue") {
			const snapshot = await this.remoteTasks.getQueueSnapshot();
			for (const chunk of splitWhatsappText(renderRemoteQueueSnapshot(snapshot))) {
				await this.sendMessageSafe(chatId, chunk, "/queue");
			}
			return;
		}

		if (command === "history") {
			const history = await this.remoteTasks.getHistory(
				parseHistoryArgs(body.replace(/^\/history\s*/i, ""), {
					limit: 10,
					maxLimit: 20,
					channel: "whatsapp",
					chatId,
				}),
			);
			for (const chunk of splitWhatsappText(renderRemoteTaskHistory(history))) {
				await this.sendMessageSafe(chatId, chunk, "/history");
			}
			return;
		}

		if (command === "task") {
			const selector = parseTaskSelector(body.replace(/^\/task\s*/i, ""));
			if (!selector) {
				await this.sendMessageSafe(chatId, this.usage.task, "/task");
				return;
			}
			const task = await this.remoteTasks.findTask({
				...selector,
				channel: "whatsapp",
				chatId,
			});
			await this.sendMessageSafe(
				chatId,
				task ? renderRemoteTaskDetails(task) : `Task ${body.replace(/^\/task\s*/i, "").trim() || "last"} not found.`,
				"/task",
			);
			return;
		}

		if (command === "cancel") {
			const taskId = parseIdCommand(body);
			if (!taskId) {
				await this.sendMessageSafe(chatId, this.usage.cancel, "/cancel");
				return;
			}
			const result = await this.remoteTasks.cancelTask(taskId);
			await this.sendMessageSafe(chatId, result.message, "/cancel");
			return;
		}

		if (command === "artifacts") {
			await this.sendTaskArtifactsToWhatsapp(
				chatId,
				body.replace(/^\/artifacts\s*/i, "") || "last",
			);
			return;
		}

		if (command === "schedule") {
			const parsed = parseScheduleCommand(body.replace(/^\/schedule\s*/i, ""));
			if (!parsed) {
				await this.sendMessageSafe(chatId, this.usage.schedule, "/schedule");
				return;
			}
			if (parsed.kind === "list") {
				const schedules = await this.remoteSchedules.list({
					channel: "whatsapp",
					chatId,
				});
				for (const chunk of splitWhatsappText(renderRemoteSchedules(schedules))) {
					await this.sendMessageSafe(chatId, chunk, "/schedule");
				}
				return;
			}
			if (parsed.kind === "add") {
				const schedule = await this.remoteSchedules.add({
					channel: "whatsapp",
					chatId,
					prompt: parsed.prompt,
					intervalMinutes: parsed.intervalMinutes,
				});
				await this.sendMessageSafe(
					chatId,
					`Schedule #${schedule.id} active every ${schedule.intervalMinutes}m.`,
					"/schedule",
				);
				return;
			}
			if (parsed.kind === "remove") {
				const removed = await this.remoteSchedules.remove(parsed.id);
				await this.sendMessageSafe(
					chatId,
					removed
						? `Schedule #${parsed.id} removed.`
						: `Schedule #${parsed.id} not found.`,
					"/schedule",
				);
				return;
			}
			if (parsed.kind === "pause" || parsed.kind === "resume") {
				const updated =
					parsed.kind === "pause"
						? await this.remoteSchedules.pause(parsed.id)
						: await this.remoteSchedules.resume(parsed.id);
				await this.sendMessageSafe(
					chatId,
					updated
						? `Schedule #${updated.id} ${parsed.kind}d.`
						: `Schedule #${parsed.id} not found.`,
					"/schedule",
				);
				return;
			}
			const result = await this.remoteSchedules.runNow(parsed.id);
			await this.sendMessageSafe(
				chatId,
				result.ok
					? `Schedule #${parsed.id} queued as task #${result.taskId}.`
					: result.message || `Schedule #${parsed.id} failed.`,
				"/schedule",
			);
			return;
		}

		if (command === "logs") {
			const count = parseCountCommand(body, 20, 100);
			const lines = this.logs.slice(-count);
			for (const chunk of splitWhatsappText(
				lines.length > 0 ? lines.join("\n") : "No logs yet.",
			)) {
				await this.sendMessageSafe(chatId, chunk, "/logs");
			}
			return;
		}

		if (command === "git") {
			try {
				const output = await executeRemoteGitCommand(
					this.workspaceRoot,
					body.replace(/^\/git\s*/i, ""),
				);
				for (const chunk of splitWhatsappText(output)) {
					await this.sendMessageSafe(chatId, chunk, "/git");
				}
			} catch (error) {
				await this.sendMessageSafe(
					chatId,
					`git failed: ${error instanceof Error ? error.message : String(error)}`,
					"/git",
				);
			}
			return;
		}

		if (command === "changes") {
			const { stdout } = await runGitCommand(["status", "--porcelain"]);
			for (const chunk of splitWhatsappText(
				stdout.trim().length > 0
					? renderRemoteGitStatus(stdout)
					: "No working tree changes.",
			)) {
				await this.sendMessageSafe(chatId, chunk, "/changes");
			}
			return;
		}

		if (command === "diff") {
			const diffPath = body.replace(/^\/diff\s*/, "").trim();
			if (!diffPath) {
				await this.sendMessageSafe(chatId, this.usage.diff, "/diff");
				return;
			}
			const { stdout } = await runGitCommand(["diff", "--", diffPath]);
			for (const chunk of splitWhatsappText(
				stdout.trim().length > 0 ? stdout.trim() : `No diff for ${diffPath}`,
			)) {
				await this.sendMessageSafe(chatId, chunk, "/diff");
			}
			return;
		}

		if (command === "rerun") {
			if (!this.lastTaskReview?.prompt) {
				await this.sendMessageSafe(chatId, "No last task to rerun.", "/rerun");
				return;
			}
			await this.enqueueTaskRequest(chatId, this.lastTaskReview.prompt);
			return;
		}

		if (command === "resume") {
			if (!this.lastTaskReview) {
				await this.sendMessageSafe(chatId, "No interrupted task to resume.", "/resume");
				return;
			}
			if (this.lastTaskReview.outcome !== "interrupted") {
				await this.sendMessageSafe(chatId, "Last task is not interrupted.", "/resume");
				return;
			}
			await this.enqueueTaskRequest(chatId, this.lastTaskReview.prompt);
			return;
		}

		if (command === "commit") {
			if (!this.lastTaskReview?.canCommit) {
				await this.sendMessageSafe(chatId, "No changed files from the last task.", "/commit");
				return;
			}
			const message = body.replace(/^\/commit\s*/, "").trim();
			if (!message) {
				await this.sendMessageSafe(chatId, this.usage.commit, "/commit");
				return;
			}
			const result = await commitTaskFiles({
				workspaceRoot: this.workspaceRoot,
				files: this.lastTaskReview.changedFiles,
				message,
			});
			if (!result.ok) {
				await this.sendMessageSafe(chatId, result.message, "/commit");
				return;
			}
			await this.setLastTaskReview(await collectTaskReviewSummary({
				workspaceRoot: this.workspaceRoot,
				prompt: this.lastTaskReview.prompt,
				outcome: this.lastTaskReview.outcome,
				error: this.lastTaskReview.error,
				checks: this.lastTaskReview.checks,
			}));
			const updatedReview = this.lastTaskReview;
			if (!updatedReview) {
				return;
			}
			for (const chunk of splitWhatsappText(
				`${result.message}\n\n${renderWhatsappTaskReview(updatedReview)}`,
			)) {
				await this.sendMessageSafe(chatId, chunk, "/commit");
			}
			return;
		}

		if (command === "revert") {
			if (!this.lastTaskReview || this.lastTaskReview.changedFiles.length === 0) {
				await this.sendMessageSafe(chatId, "No changed files from the last task.", "/revert");
				return;
			}
			const result = await revertTaskFiles({
				workspaceRoot: this.workspaceRoot,
				files: this.lastTaskReview.changedFiles,
			});
			if (!result.ok) {
				await this.sendMessageSafe(chatId, result.message, "/revert");
				return;
			}
			await this.setLastTaskReview(await collectTaskReviewSummary({
				workspaceRoot: this.workspaceRoot,
				prompt: this.lastTaskReview.prompt,
				outcome: this.lastTaskReview.outcome,
				error: this.lastTaskReview.error,
				checks: this.lastTaskReview.checks,
			}));
			const updatedReview = this.lastTaskReview;
			if (!updatedReview) {
				return;
			}
			for (const chunk of splitWhatsappText(
				`${result.message}\n\n${renderWhatsappTaskReview(updatedReview)}`,
			)) {
				await this.sendMessageSafe(chatId, chunk, "/revert");
			}
			return;
		}

		if (command === "stop") {
			this.stopCurrentTask();
			await this.sendMessageSafe(chatId, "Stopped current run.", "/stop");
			return;
		}

		const taskText = command === "run" ? body.slice(5).trim() : body;
		if (!taskText) {
			await this.sendMessageSafe(chatId, this.usage.run, "/run");
			return;
		}

		await this.enqueueTaskRequest(chatId, taskText);
	}

	private async runQueuedTask(task: RemoteTaskRecord): Promise<void> {
		await this.executeTaskForChat(task);
	}

	private async enqueueTaskRequest(chatId: string, taskText: string): Promise<void> {
		const normalizedTask = taskText.trim();
		if (!normalizedTask) {
			return;
		}
		const queued = await this.remoteTasks.enqueue({
			channel: "whatsapp",
			chatId,
			prompt: normalizedTask,
		});
		if (!queued.started) {
			await this.sendMessageSafe(
				chatId,
				`Task #${queued.task.id} queued at position ${queued.position}.`,
				"/run",
			);
		}
	}

	private async enqueueScheduledTaskRequest(
		chatId: string,
		taskText: string,
		scheduleId: number,
	): Promise<{ ok: boolean; taskId?: number; message?: string }> {
		const normalizedTask = taskText.trim();
		if (!normalizedTask) {
			return { ok: false, message: "Scheduled prompt is empty." };
		}
		const queued = await this.remoteTasks.enqueue({
			channel: "whatsapp",
			chatId,
			prompt: normalizedTask,
			source: "schedule",
			scheduleId,
		});
		await this.sendMessageSafe(
			chatId,
			queued.started
				? `Schedule #${scheduleId} started task #${queued.task.id}.`
				: `Schedule #${scheduleId} queued task #${queued.task.id} at position ${queued.position}.`,
			"/schedule",
		);
		return { ok: true, taskId: queued.task.id };
	}

	private async sendTaskArtifactsToWhatsapp(
		chatId: string,
		selectorInput: string,
	): Promise<void> {
		const selector = parseTaskSelector(selectorInput);
		if (!selector) {
			await this.sendMessageSafe(chatId, this.usage.artifacts, "/artifacts");
			return;
		}
		const task = await this.remoteTasks.findTask({
			...selector,
			channel: "whatsapp",
			chatId,
		});
		if (!task) {
			await this.sendMessageSafe(
				chatId,
				`Task ${selectorInput.trim() || "last"} not found.`,
				"/artifacts",
			);
			return;
		}
		if (!task.artifacts || task.artifacts.length === 0) {
			await this.sendMessageSafe(chatId, `Task #${task.id} has no artifacts yet.`, "/artifacts");
			return;
		}

		for (const artifact of task.artifacts) {
			try {
				await this.sock?.sendMessage(chatId, {
					document: { url: path.join(this.workspaceRoot, artifact.relativePath) },
					fileName: artifact.fileName,
					mimetype: artifact.mimeType,
					caption: `${WA_BOT_PREFIX}Task #${task.id} ${artifact.label}`,
				});
			} catch (error) {
				this.pushLog(
					`[whatsapp:error] artifact send failed: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
				await this.sendMessageSafe(
					chatId,
					`Failed to send ${artifact.fileName}.`,
					"/artifacts",
				);
				return;
			}
		}
	}

	private async executeTaskForChat(task: RemoteTaskRecord): Promise<void> {
		const chatId = task.chatId;
		const taskText = task.prompt;
		this.isProcessing = true;
		this.activeRemoteTaskId = task.id;
		this.stopRequestedTaskId = null;
		this.currentChatId = chatId;
		this.setStatus("Running");
		this.pushLog(`[queue] task #${task.id} from ${chatId}: ${taskText.slice(0, 180)}`);

		// Send "typing..." status so WhatsApp user sees the bot is thinking
		void this.sock?.sendPresenceUpdate("composing", chatId);
		const typingInterval = setInterval(() => {
			if (this.sock && this.active) {
				void this.sock.sendPresenceUpdate("composing", chatId);
			}
		}, 10_000);

		const runtime = this.ensureRuntime();
		const changedFilesBefore = await collectWorkspaceChangedFiles(this.workspaceRoot);
		let output = "";
		const unsub = runtime.onEvent((event: RuntimeEvent) => {
			if (event.type === "text_delta") {
				output += event.delta;
				return;
			}

			if (event.type === "tool_start") {
				const details = summarizeWhatsappToolPayload(event.args);
				this.pushLog(
					`[tool:start] ${event.toolName}${details ? ` ${details}` : ""}`,
				);
				return;
			}

			if (event.type === "tool_end") {
				const state = event.isError ? "error" : "done";
				const details = summarizeWhatsappToolPayload(event.result);
				this.pushLog(
					`[tool:${state}] ${event.toolName}${details ? ` ${details}` : ""}`,
				);
			}
		});

		try {
			await this.taskRunner.runTask(taskText);
			if (!this.sock || !this.active) {
				this.pushLog("[whatsapp] task aborted");
				return;
			}
			await this.setLastTaskReview(await collectTaskReviewSummary({
				workspaceRoot: this.workspaceRoot,
				prompt: taskText,
				outcome: "completed",
			}));
			const completedArtifacts = this.lastTaskReview
				? await createTaskArtifacts({
						workspaceRoot: this.workspaceRoot,
						taskId: task.id,
						review: this.lastTaskReview,
					})
				: undefined;
			await this.remoteTasks.completeTask({
				id: task.id,
				status: "completed",
				summary: this.lastTaskReview?.summary,
				responsePreview:
					output.length > 300 ? `${output.slice(0, 297)}...` : output,
				artifacts: completedArtifacts,
			});
			const chunks = splitWhatsappText(output || "Done.");
			for (const chunk of chunks) {
				await this.sendMessageSafe(chatId, chunk);
			}
			const completedReview = this.lastTaskReview;
			if (!completedReview) {
				return;
			}
			if (
				task.source !== "schedule" &&
				(shouldSendAutomaticTaskReview(completedReview) &&
					(completedReview.outcome !== "completed" ||
						completedReview.checks.length > 0 ||
						didTaskChangeFiles(
							changedFilesBefore,
							completedReview.changedFiles,
						)))
			) {
				for (const chunk of splitWhatsappText(
					renderWhatsappTaskReviewCompact(completedReview),
				)) {
					await this.sendMessageSafe(chatId, chunk, "review");
				}
			}
			this.pushLog("[whatsapp] task done");
			this.setStatus("Ready");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const interrupted = this.stopRequestedTaskId === task.id;
			await this.setLastTaskReview(await collectTaskReviewSummary({
				workspaceRoot: this.workspaceRoot,
				prompt: taskText,
				outcome: interrupted ? "interrupted" : "failed",
				error: interrupted ? "Task cancelled before completion." : message,
			}));
			const failedArtifacts = this.lastTaskReview
				? await createTaskArtifacts({
						workspaceRoot: this.workspaceRoot,
						taskId: task.id,
						review: this.lastTaskReview,
					})
				: undefined;
			await this.remoteTasks.completeTask({
				id: task.id,
				status: interrupted ? "interrupted" : "failed",
				error: interrupted ? "Task cancelled before completion." : message,
				summary: this.lastTaskReview?.summary,
				responsePreview:
					output.length > 300 ? `${output.slice(0, 297)}...` : output,
				artifacts: failedArtifacts,
			});
			const failedReview = this.lastTaskReview;
			if (!failedReview) {
				await this.sendMessageSafe(
					chatId,
					`Task ${interrupted ? "interrupted" : "failed"}: ${interrupted ? "cancelled" : message}`,
					"failure",
				);
				return;
			}
			if (task.source === "schedule") {
				await this.sendMessageSafe(
					chatId,
					`Scheduled task ${interrupted ? "interrupted" : "failed"}: ${interrupted ? "cancelled" : message}`,
					"failure",
				);
			} else {
				for (const chunk of splitWhatsappText(
					renderWhatsappTaskReviewCompact(failedReview),
				)) {
					await this.sendMessageSafe(chatId, chunk, "failure");
				}
			}
			this.pushLog(`[whatsapp:error] ${message}`);
			this.setStatus(interrupted ? "Idle" : "Error");
		} finally {
			clearInterval(typingInterval);
			void this.sock?.sendPresenceUpdate("paused", chatId);
			unsub();
			this.isProcessing = false;
			this.activeRemoteTaskId = null;
			this.stopRequestedTaskId = null;
		}
	}

	// ---------------------------------------------------------------------------
	// Runtime
	// ---------------------------------------------------------------------------

	private ensureRuntime(): AgentRuntime {
		const settings = readTelecodeSettings();
		const ensured = ensureChannelRuntime({
			settings: settings.agent,
			tools: this.tools,
			taskRunner: this.taskRunner,
			runtimeConfigSignature: this.runtimeConfigSignature,
			workspaceRoot: this.workspaceRoot,
			onLog: (line) => this.pushLog(line),
			initLogLine: `[whatsapp] initializing runtime (engine=${settings.agent.provider})`,
		});
		this.runtimeConfigSignature = ensured.signature;
		return ensured.runtime;
	}

	private async setLastTaskReview(result: TaskReviewSummary): Promise<void> {
		this.lastTaskReview = result;
		await saveTaskReviewSummary(this.workspaceRoot, result);
	}

	// ---------------------------------------------------------------------------
	// Logging & status
	// ---------------------------------------------------------------------------

	private pushLog(line: string): void {
		const entry = `[${new Date().toLocaleTimeString()}] ${line}`;
		this.logs.push(entry);
		const maxLines = Math.max(50, readTelecodeSettings().agent.channelLogLines || 300);
		while (this.logs.length > maxLines) this.logs.shift();
		this.onLog?.(entry);
	}

	private setStatus(status: string): void {
		this.onStatus?.(status);
	}

	/** Emit QR data as a base64-encoded SVG into the log stream for UI rendering. */
	private async emitQrToLogs(qr: string): Promise<void> {
		try {
			const svg = await QRCode.toString(qr, {
				type: "svg",
				width: 260,
				margin: 1,
				color: {
					dark: "#1d232f",
					light: "#ffffff",
				},
			});
			const payload = Buffer.from(svg, "utf8").toString("base64");
			this.pushLog(`[whatsapp:qrsvg] ${payload}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.pushLog(`[whatsapp:warn] failed to render SVG QR: ${message}`);
		}
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	private isDuplicateMessage(messageId: string): boolean {
		const now = Date.now();
		for (const [id, ts] of this.seenMessageIds.entries()) {
			if (now - ts > 90_000) {
				this.seenMessageIds.delete(id);
			}
		}
		if (this.seenMessageIds.has(messageId)) {
			return true;
		}
		this.seenMessageIds.set(messageId, now);
		return false;
	}

	private async sendMessageSafe(
		chatId: string,
		text: string,
		label?: string,
	): Promise<boolean> {
		try {
			const prefixed = `${WA_BOT_PREFIX}${text}`;
			await this.sock?.sendMessage(chatId, { text: prefixed });
			this.trackOutgoingText(prefixed);
			if (label) {
				this.pushLog(`[whatsapp] ${label} reply sent`);
			}
			return true;
		} catch (error) {
			if (!label) return false;
			const message = error instanceof Error ? error.message : String(error);
			this.pushLog(`[whatsapp:error] ${label} reply failed: ${message}`);
			return false;
		}
	}

	// ---------------------------------------------------------------------------
	// Startup greeting
	// ---------------------------------------------------------------------------

	private getStartupMessage(): string {
		return renderWhatsappStartupMessage(readTelecodeSettings().agent);
	}

	private async sendStartupGreeting(): Promise<void> {
		if (this.startupGreetingSent) return;
		const chatId = this.currentChatId || (await this.loadLastChatId());
		if (!chatId) {
			this.pushLog("[whatsapp] startup greeting skipped (no known chatId yet)");
			return;
		}
		const sent = await this.sendMessageSafe(
			chatId,
			this.getStartupMessage(),
			"startup",
		);
		if (sent) {
			this.startupGreetingSent = true;
		}
	}

	// ---------------------------------------------------------------------------
	// Chat persistence
	// ---------------------------------------------------------------------------

	private getLastChatFilePath(): string {
		return path.join(os.homedir(), ".telecode-ai", "whatsapp-last-chat.txt");
	}

	private async loadLastChatId(): Promise<string | null> {
		try {
			const raw = await fs.readFile(this.getLastChatFilePath(), "utf8");
			const value = raw.trim();
			return value.length > 0 ? value : null;
		} catch {
			return null;
		}
	}

	private async saveLastChatId(chatId: string): Promise<void> {
		try {
			const file = this.getLastChatFilePath();
			await ensureDir(path.dirname(file));
			await fs.writeFile(file, chatId, "utf8");
		} catch {
			// ignore persistence errors
		}
	}

	// ---------------------------------------------------------------------------
	// Dedup & anti-loop
	// ---------------------------------------------------------------------------

	private normalizeMessageText(text: string): string {
		return normalizeWhatsappMessageText(text);
	}

	private trackOutgoingText(text: string): void {
		const normalized = this.normalizeMessageText(text);
		if (!normalized) return;
		const now = Date.now();
		this.recentOutgoingTexts.set(normalized, now);
		for (const [key, ts] of this.recentOutgoingTexts.entries()) {
			if (now - ts > 30_000) {
				this.recentOutgoingTexts.delete(key);
			}
		}
	}

	private isLikelyOwnOutgoing(text: string): boolean {
		const normalized = this.normalizeMessageText(text);
		if (!normalized) return false;
		const ts = this.recentOutgoingTexts.get(normalized);
		if (!ts) return false;
		return Date.now() - ts <= 15_000;
	}

	private isDuplicateIncomingText(chatId: string, text: string): boolean {
		const normalized = this.normalizeMessageText(text);
		if (!normalized) return false;
		const now = Date.now();
		const key = `${chatId}|${normalized}`;
		for (const [fingerprint, ts] of this.seenIncomingFingerprints.entries()) {
			if (now - ts > 3_000) {
				this.seenIncomingFingerprints.delete(fingerprint);
			}
		}
		const existing = this.seenIncomingFingerprints.get(key);
		if (existing && now - existing < 2_500) {
			return true;
		}
		this.seenIncomingFingerprints.set(key, now);
		return false;
	}

	private clearStartupWatchdog(): void {
		if (this.startupWatchdog) {
			clearTimeout(this.startupWatchdog);
			this.startupWatchdog = null;
		}
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}
}
