import { readTelecodeSettings, resolveUiLanguage } from "../config/settings";
import type { RuntimeEvent } from "../engine/types";
import { i18n } from "../services/i18n";
import type { ChatViewProvider } from "../ui/chatViewProvider";

const STATUS_SUPPRESSED_PREFIXES_MINIMAL = [
	"tools_available ",
	"prompt_stack ",
	"prompt_stack_missing ",
	"llm_config ",
	"event:",
	"tool_execution_update:",
] as const;

const STATUS_SUPPRESSED_PREFIXES_NORMAL = [
	"tools_available ",
	"prompt_stack ",
	"llm_config ",
	"tool_execution_start:",
	"tool_execution_end:",
	"agent_start",
	"turn_start",
	"message_start",
	"message_end",
	"turn_end",
	"agent_end",
] as const;

type ChatViewStatusSink = Pick<
	ChatViewProvider,
	"appendOutput" | "setProgress" | "setStatus"
>;

export function isBusyStatus(status: string): boolean {
	const lower = status.trim().toLowerCase();
	return (
		lower.includes("running") ||
		lower.includes("thinking") ||
		lower.includes("tool ") ||
		lower.includes("connecting")
	);
}

export function shouldPreferLocalStatus(status: string): boolean {
	const normalized = status.trim().toLowerCase();
	return (
		isBusyStatus(status) ||
		normalized.includes("error") ||
		normalized.includes("stopped")
	);
}

export function getStatusPriority(status: string): number {
	const normalized = status.trim().toLowerCase();
	if (normalized.includes("error")) {
		return 400;
	}
	if (isBusyStatus(status)) {
		return 300;
	}
	if (normalized.includes("ready")) {
		return 200;
	}
	if (normalized.includes("idle")) {
		return 100;
	}
	if (normalized.includes("stopped")) {
		return 50;
	}
	return 0;
}

export function getAggregatedChannelStatus(
	statuses: Iterable<string>,
): string | null {
	const normalizedStatuses = [...statuses]
		.map((status) => status.trim())
		.filter((status) => status.length > 0);

	if (normalizedStatuses.length === 0) {
		return null;
	}

	const topPriority = Math.max(
		...normalizedStatuses.map((status) => getStatusPriority(status)),
	);
	const topStatuses = normalizedStatuses.filter(
		(status) => getStatusPriority(status) === topPriority,
	);
	const uniqueTopStatuses = [...new Set(topStatuses)];

	if (topPriority >= 300) {
		return uniqueTopStatuses.length === 1 ? uniqueTopStatuses[0] : "Channels active";
	}

	return uniqueTopStatuses[0] ?? null;
}

export function getEffectiveStatus(
	localStatus: string,
	channelStatuses: Iterable<string>,
): string {
	if (shouldPreferLocalStatus(localStatus)) {
		return localStatus;
	}

	return getAggregatedChannelStatus(channelStatuses) ?? localStatus;
}

export class UiStatusController {
	private progressTimer: NodeJS.Timeout | null = null;
	private statusStartedAt = 0;
	private activeStatus = "Idle";
	private localStatus = "Idle";
	private toolCountInRun = 0;
	private lastToolStatus = "";
	private pendingDuplicateLogLine = "";
	private pendingDuplicateLogCount = 0;
	private pendingDuplicateLogStartedAt = 0;
	private lastRenderedStatus = "";
	private lastRenderedStatusAt = 0;
	private readonly channelStatuses = new Map<string, string>();

	constructor(
		private readonly getChatView: () => ChatViewStatusSink | null,
	) {}

	public dispose(): void {
		if (this.progressTimer) {
			clearInterval(this.progressTimer);
			this.progressTimer = null;
		}
		this.flushDuplicateLogSummary();
	}

	public getActiveStatus(): string {
		return this.activeStatus;
	}

	public appendLogLine(line: string): void {
		if (shouldCoalesceLogLine(line)) {
			if (line === this.pendingDuplicateLogLine) {
				this.pendingDuplicateLogCount += 1;
				return;
			}
			this.flushDuplicateLogSummary();
			this.pendingDuplicateLogLine = line;
			this.pendingDuplicateLogCount = 1;
			this.pendingDuplicateLogStartedAt = Date.now();
			this.appendOutput(`${line}\n`);
			return;
		}
		this.flushDuplicateLogSummary();
		this.appendOutput(`${line}\n`);
	}

	public handleRuntimeEvent(event: RuntimeEvent): void {
		if (event.type === "text_delta") {
			this.appendOutput(event.delta);
			return;
		}

		if (event.type === "tool_start") {
			const details = summarizeEventDetails(event.args);
			this.appendLogLine(
				`[tool:start] ${event.toolName}${details ? ` ${details}` : ""}`,
			);
			return;
		}

		if (event.type === "tool_end") {
			const state = event.isError ? "error" : "done";
			const details = summarizeEventDetails(event.result);
			this.appendLogLine(
				`[tool:${state}] ${event.toolName}${details ? ` ${details}` : ""}`,
			);
			return;
		}

		if (event.type === "status") {
			if (!shouldRenderStatus(event.message)) {
				return;
			}
			const formatted = formatRuntimeStatus(event.message);
			const now = Date.now();
			if (
				formatted === this.lastRenderedStatus &&
				now - this.lastRenderedStatusAt < 8000
			) {
				return;
			}
			this.lastRenderedStatus = formatted;
			this.lastRenderedStatusAt = now;
			this.appendLogLine(`[status] ${formatted}`);
			return;
		}

		if (event.type === "error") {
			this.appendLogLine(`[error] ${event.message}`);
			return;
		}

		if (event.type === "done") {
			this.lastRenderedStatus = "";
			this.lastRenderedStatusAt = 0;
			this.setLocalStatus("Ready");
		}
	}

	public setLocalStatus(status: string): void {
		this.localStatus = status;
		this.syncEffectiveStatus();
	}

	public setChannelStatus(channelId: string, status: string): void {
		this.channelStatuses.set(channelId, status);
		this.syncEffectiveStatus();
	}

	public clearChannelStatuses(): void {
		if (this.channelStatuses.size === 0) {
			return;
		}
		this.channelStatuses.clear();
		this.syncEffectiveStatus();
	}

	private appendOutput(text: string): void {
		this.getChatView()?.appendOutput(text);
	}

	private flushDuplicateLogSummary(): void {
		if (
			this.pendingDuplicateLogCount <= 1 ||
			this.pendingDuplicateLogLine.length === 0
		) {
			this.pendingDuplicateLogLine = "";
			this.pendingDuplicateLogCount = 0;
			this.pendingDuplicateLogStartedAt = 0;
			return;
		}

		const repeatedTimes = this.pendingDuplicateLogCount - 1;
		const elapsedSec = Math.max(
			0,
			Math.round((Date.now() - this.pendingDuplicateLogStartedAt) / 1000),
		);
		this.appendOutput(
			`[status] repeated ${repeatedTimes} more times${
				elapsedSec > 0 ? ` over ${elapsedSec}s` : ""
			}\n`,
		);
		this.pendingDuplicateLogLine = "";
		this.pendingDuplicateLogCount = 0;
		this.pendingDuplicateLogStartedAt = 0;
	}

	private syncEffectiveStatus(): void {
		this.applyStatus(
			getEffectiveStatus(this.localStatus, this.channelStatuses.values()),
		);
	}

	private applyStatus(status: string): void {
		this.activeStatus = status;
		this.getChatView()?.setStatus(status);
		this.syncProgressState(status);
		if (!isBusyStatus(status)) {
			this.flushDuplicateLogSummary();
		}
	}

	private syncProgressState(status: string): void {
		const busy = isBusyStatus(status);
		if (!busy) {
			this.statusStartedAt = 0;
			this.toolCountInRun = 0;
			this.lastToolStatus = "";
			if (this.progressTimer) {
				clearInterval(this.progressTimer);
				this.progressTimer = null;
			}
			this.getChatView()?.setProgress(status, false);
			return;
		}

		if (this.statusStartedAt === 0) {
			this.statusStartedAt = Date.now();
			this.toolCountInRun = 0;
			this.lastToolStatus = "";
		}

		const lower = status.toLowerCase();
		if (lower.includes("tool ") && status !== this.lastToolStatus) {
			this.toolCountInRun += 1;
			this.lastToolStatus = status;
		}

		this.publishProgress();

		if (!this.progressTimer) {
			this.progressTimer = setInterval(() => {
				this.publishProgress();
			}, 1000);
		}
	}

	private publishProgress(): void {
		if (this.statusStartedAt === 0) {
			this.getChatView()?.setProgress(this.activeStatus, false);
			return;
		}

		const elapsedSec = Math.max(
			0,
			Math.floor((Date.now() - this.statusStartedAt) / 1000),
		);
		const maxSteps = readTelecodeSettings().agent.maxSteps;
		const toolsPart =
			this.toolCountInRun > 0
				? ` • tools ${this.toolCountInRun}/${maxSteps}`
				: "";
		this.getChatView()?.setProgress(
			`${this.activeStatus} • ${elapsedSec}s${toolsPart}`,
			true,
		);
	}
}

function shouldCoalesceLogLine(line: string): boolean {
	return (
		line.startsWith("[status] ") ||
		line.startsWith("[phase] ") ||
		line.startsWith("[heartbeat] ")
	);
}

function shouldRenderStatus(raw: string): boolean {
	const normalized = raw.trim();
	if (!normalized) {
		return false;
	}
	const verbosity = readTelecodeSettings().agent.statusVerbosity;
	if (verbosity === "debug") {
		return true;
	}
	if (verbosity === "normal") {
		if (
			normalized.startsWith("event:") ||
			STATUS_SUPPRESSED_PREFIXES_NORMAL.some((prefix) =>
				normalized.startsWith(prefix),
			)
		) {
			return false;
		}
		return true;
	}
	if (
		STATUS_SUPPRESSED_PREFIXES_NORMAL.some((prefix) =>
			normalized.startsWith(prefix),
		)
	) {
		return false;
	}
	for (const prefix of STATUS_SUPPRESSED_PREFIXES_MINIMAL) {
		if (normalized.startsWith(prefix)) {
			return false;
		}
	}
	return true;
}

function formatRuntimeStatus(message: string): string {
	const settings = readTelecodeSettings();
	const lang =
		settings.agent.language === "auto"
			? resolveUiLanguage("auto")
			: settings.agent.language;
	i18n.setLanguage(lang as "ru" | "en");
	return i18n.formatStatus(message);
}

function summarizeEventDetails(value: unknown): string {
	if (!value || typeof value !== "object") {
		return "";
	}

	const record = value as Record<string, unknown>;
	const details: string[] = [];
	pushDetail(details, "path", record.path);
	pushDetail(details, "query", record.query);
	pushDetail(details, "pattern", record.pattern);
	pushDetail(details, "command", record.command);
	pushDetail(details, "cwd", record.cwd);
	pushDetail(details, "count", record.count);
	pushDetail(details, "bytes", record.bytes);
	if (
		details.length === 0 &&
		"details" in record &&
		record.details &&
		typeof record.details === "object"
	) {
		const nested = record.details as Record<string, unknown>;
		pushDetail(details, "path", nested.path);
		pushDetail(details, "count", nested.count);
		pushDetail(details, "bytes", nested.bytes);
		pushDetail(details, "cwd", nested.cwd);
	}
	return details.join(" ");
}

function pushDetail(target: string[], key: string, value: unknown): void {
	if (value === undefined || value === null) {
		return;
	}
	const normalized = String(value).replace(/\s+/g, " ").trim();
	if (!normalized) {
		return;
	}
	const compact =
		normalized.length > 64 ? `${normalized.slice(0, 61)}...` : normalized;
	target.push(`${key}=${compact}`);
}
