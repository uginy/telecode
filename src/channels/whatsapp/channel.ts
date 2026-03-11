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
import { isWhatsappSenderAllowed } from "./access";

const WA_MESSAGE_LIMIT = 3000;
const WA_BOT_PREFIX = "[Bot] ";

function splitText(input: string, limit = WA_MESSAGE_LIMIT): string[] {
	const text = input.trim();
	if (!text) return ["Done."];
	if (text.length <= limit) return [text];
	const out: string[] = [];
	let i = 0;
	while (i < text.length) {
		out.push(text.slice(i, i + limit));
		i += limit;
	}
	return out;
}

function expandHome(inputPath: string): string {
	if (!inputPath.startsWith("~")) return inputPath;
	return path.join(os.homedir(), inputPath.slice(1));
}

async function ensureDir(dir: string): Promise<void> {
	await fs.mkdir(dir, { recursive: true });
}

function summarizeToolPayload(value: unknown): string {
	if (!value || typeof value !== "object") {
		return "";
	}

	const record = findSummaryRecord(value as Record<string, unknown>);
	const parts: string[] = [];
	pushSummary(parts, "command", record.command ?? record.cmd);
	pushSummary(parts, "path", record.path);
	pushSummary(parts, "cwd", record.cwd);
	pushSummary(parts, "query", record.query);
	pushSummary(parts, "pattern", record.pattern);
	pushSummary(parts, "glob", record.glob);
	pushSummary(parts, "count", record.count);
	pushSummary(parts, "bytes", record.bytes);
	pushSummary(parts, "replacements", record.replacements);

	return parts.join(" ");
}

function findSummaryRecord(
	record: Record<string, unknown>,
	depth = 0,
): Record<string, unknown> {
	if (
		record.command !== undefined ||
		record.cmd !== undefined ||
		record.path !== undefined ||
		record.cwd !== undefined ||
		record.query !== undefined ||
		record.pattern !== undefined ||
		record.glob !== undefined
	) {
		return record;
	}

	if (depth >= 3) {
		return record;
	}

	for (const key of ["details", "args", "input", "params", "result"]) {
		const nested = record[key];
		if (nested && typeof nested === "object") {
			return findSummaryRecord(nested as Record<string, unknown>, depth + 1);
		}
	}

	return record;
}

function pushSummary(parts: string[], key: string, value: unknown): void {
	if (value === undefined || value === null) {
		return;
	}

	const text = String(value).replace(/\s+/g, " ").trim();
	if (!text) {
		return;
	}

	const compact = text.length > 70 ? `${text.slice(0, 67)}...` : text;
	parts.push(`${key}=${compact}`);
}

type IncomingCommand = "help" | "status" | "stop" | "run" | null;

/** Minimal shape of a Baileys incoming message. */
type BaileysMessage = {
	key: {
		id?: string;
		remoteJid?: string;
		fromMe?: boolean;
		participant?: string;
	};
	message?: {
		conversation?: string;
		extendedTextMessage?: {
			text?: string;
		};
	};
};

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

	private taskRunner: TaskRunner;

	constructor(
		private readonly tools: AgentTool[],
		private readonly workspaceRoot: string,
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
		const body =
			msg.message?.conversation?.trim() ||
			msg.message?.extendedTextMessage?.text?.trim() ||
			"";
		const fromMe = msg.key?.fromMe === true;
		const command = this.parseCommand(body);
		const messageId = this.extractMessageId(msg);

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
			await this.sendMessageSafe(
				chatId,
				"Commands:\n/status — current state\n/stop — stop current run\n/run <task> — run a task (required in self-chat)",
				"/help",
			);
			return;
		}

		if (command === "status") {
			await this.sendMessageSafe(
				chatId,
				this.isProcessing ? "Agent status: running" : "Agent status: ready",
				"/status",
			);
			return;
		}

		if (command === "stop") {
			this.stopCurrentTask();
			await this.sendMessageSafe(chatId, "Stopped current run.", "/stop");
			return;
		}

		if (this.isProcessing) {
			await this.sendMessageSafe(
				chatId,
				"Agent is busy. Wait for completion or send /stop.",
				"busy",
			);
			return;
		}

		const taskText = command === "run" ? body.slice(5).trim() : body;
		if (!taskText) {
			await this.sendMessageSafe(chatId, "Usage: /run <task>", "/run");
			return;
		}

		this.isProcessing = true;
		this.currentChatId = chatId;
		this.setStatus("Running");
		this.pushLog(`[whatsapp] task from ${chatId}: ${taskText.slice(0, 180)}`);

		// Send "typing..." status so WhatsApp user sees the bot is thinking
		void this.sock?.sendPresenceUpdate("composing", chatId);
		const typingInterval = setInterval(() => {
			if (this.sock && this.active) {
				void this.sock.sendPresenceUpdate("composing", chatId);
			}
		}, 10_000);

		const runtime = this.ensureRuntime();
		let output = "";
		const unsub = runtime.onEvent((event: RuntimeEvent) => {
			if (event.type === "text_delta") {
				output += event.delta;
				return;
			}

			if (event.type === "tool_start") {
				const details = summarizeToolPayload(event.args);
				this.pushLog(
					`[tool:start] ${event.toolName}${details ? ` ${details}` : ""}`,
				);
				return;
			}

			if (event.type === "tool_end") {
				const state = event.isError ? "error" : "done";
				const details = summarizeToolPayload(event.result);
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
			const chunks = splitText(output || "Done.");
			for (const chunk of chunks) {
				await this.sendMessageSafe(chatId, chunk);
			}
			this.pushLog("[whatsapp] task done");
			this.setStatus("Ready");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.sock?.sendMessage(chatId, { text: `Task failed: ${message}` });
			this.pushLog(`[whatsapp:error] ${message}`);
			this.setStatus("Error");
		} finally {
			clearInterval(typingInterval);
			void this.sock?.sendPresenceUpdate("paused", chatId);
			unsub();
			this.isProcessing = false;
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

	private parseCommand(body: string): IncomingCommand {
		if (body.startsWith("/help")) return "help";
		if (body.startsWith("/status")) return "status";
		if (body.startsWith("/stop")) return "stop";
		if (body.startsWith("/run ")) return "run";
		return null;
	}

	private extractMessageId(msg: BaileysMessage): string | null {
		const id = msg.key?.id;
		if (typeof id === "string" && id.length > 0) return id;
		return null;
	}

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
		const settings = readTelecodeSettings();
		const lang = settings.agent.language;
		if (lang === "ru") {
			return "TeleCode AI подключен. Отправьте /status";
		}
		if (lang === "en") {
			return "TeleCode AI connected. Send /status";
		}
		return settings.agent.uiLanguage === "en"
			? "TeleCode AI connected. Send /status"
			: "TeleCode AI подключен. Отправьте /status";
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
		return text.replace(/\s+/g, " ").trim().toLowerCase();
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
