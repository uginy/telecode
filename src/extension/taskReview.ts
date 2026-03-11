import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";

export type TaskOutcome = "completed" | "failed" | "interrupted";
export type TaskCheckStatus = "passed" | "failed" | "skipped";
export type TaskFileStatus =
	| "modified"
	| "added"
	| "deleted"
	| "renamed"
	| "untracked";

export interface TaskCheckResult {
	id: "lint" | "build" | "test";
	label: string;
	status: TaskCheckStatus;
	summary: string;
	command?: string;
	exitCode?: number | null;
	durationMs?: number;
}

export interface TaskChangedFile {
	path: string;
	status: TaskFileStatus;
	rawStatus: string;
}

export interface TaskReviewSummary {
	prompt: string;
	outcome: TaskOutcome;
	error?: string;
	summary: string;
	completedAt: string;
	branch: string | null;
	gitAvailable: boolean;
	hasChanges: boolean;
	canCommit: boolean;
	changedFiles: TaskChangedFile[];
	checks: TaskCheckResult[];
}

interface CommandResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
}

const LAST_RESULT_DIR = ".telecode";
const LAST_RESULT_FILE = "last-result.json";
const ACTIVE_RUN_FILE = "active-run.json";
const CHECK_SCRIPT_ORDER = ["lint", "build", "test"] as const;
const CHECK_LABEL: Record<(typeof CHECK_SCRIPT_ORDER)[number], string> = {
	lint: "Lint",
	build: "Build",
	test: "Tests",
};

export function parseGitStatusPorcelain(output: string): TaskChangedFile[] {
	return output
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 0 && !line.startsWith("## "))
		.map((line) => {
			const rawStatus = line.slice(0, 2);
			const rawPath = line.slice(3).trim();
			const normalizedPath = rawPath.includes(" -> ")
				? rawPath.split(" -> ").pop() || rawPath
				: rawPath;

			return {
				path: normalizedPath,
				rawStatus,
				status: mapGitStatus(rawStatus),
			};
		})
		.filter((file) => !isTelecodeMetaFile(file.path));
}

export function detectPackageScripts(
	packageJson: string | null,
): Array<(typeof CHECK_SCRIPT_ORDER)[number]> {
	if (!packageJson) {
		return [];
	}

	try {
		const parsed = JSON.parse(packageJson) as { scripts?: Record<string, unknown> };
		const scripts = parsed.scripts || {};
		return CHECK_SCRIPT_ORDER.filter((name) => typeof scripts[name] === "string");
	} catch {
		return [];
	}
}

export function summarizeChecks(checks: TaskCheckResult[]): string {
	if (checks.length === 0) {
		return "Checks not run";
	}

	const passed = checks.filter((check) => check.status === "passed").length;
	const failed = checks.filter((check) => check.status === "failed").length;
	const skipped = checks.filter((check) => check.status === "skipped").length;
	const parts: string[] = [];
	if (passed > 0) parts.push(`${passed} passed`);
	if (failed > 0) parts.push(`${failed} failed`);
	if (skipped > 0) parts.push(`${skipped} skipped`);
	return parts.length > 0 ? parts.join(" • ") : "Checks not run";
}

export function buildTaskSummaryText(options: {
	outcome: TaskOutcome;
	hasChanges: boolean;
	changedFilesCount: number;
	checks: TaskCheckResult[];
}): string {
	const outcomeText =
		options.outcome === "completed"
			? "Task completed"
			: options.outcome === "failed"
				? "Task failed"
				: "Task interrupted";
	const changeText = options.hasChanges
		? `${options.changedFilesCount} file${
				options.changedFilesCount === 1 ? "" : "s"
		  } changed`
		: "no file changes";
	return `${outcomeText} • ${changeText} • ${summarizeChecks(options.checks)}`;
}

export async function collectTaskReviewSummary(options: {
	workspaceRoot: string;
	prompt: string;
	outcome: TaskOutcome;
	error?: string;
	checks?: TaskCheckResult[];
}): Promise<TaskReviewSummary> {
	const checks = options.checks || [];
	const gitStatus = await runGit([
		"status",
		"--porcelain=v1",
		"--branch",
		"--untracked-files=all",
	], options.workspaceRoot);
	if (!gitStatus.ok) {
		return {
			prompt: options.prompt,
			outcome: options.outcome,
			error: options.error,
			summary: buildTaskSummaryText({
				outcome: options.outcome,
				hasChanges: false,
				changedFilesCount: 0,
				checks,
			}),
			completedAt: new Date().toISOString(),
			branch: null,
			gitAvailable: false,
			hasChanges: false,
			canCommit: false,
			changedFiles: [],
			checks,
		};
	}

	const lines = gitStatus.result.stdout.split(/\r?\n/);
	const branch = extractBranchFromStatus(lines[0] || "");
	const changedFiles = parseGitStatusPorcelain(gitStatus.result.stdout);
	return {
		prompt: options.prompt,
		outcome: options.outcome,
		error: options.error,
		summary: buildTaskSummaryText({
			outcome: options.outcome,
			hasChanges: changedFiles.length > 0,
			changedFilesCount: changedFiles.length,
			checks,
		}),
		completedAt: new Date().toISOString(),
		branch,
		gitAvailable: true,
		hasChanges: changedFiles.length > 0,
		canCommit: changedFiles.length > 0,
		changedFiles,
		checks,
	};
}

export async function runWorkspaceChecks(
	workspaceRoot: string,
): Promise<TaskCheckResult[]> {
	const packageJson = await readPackageJson(workspaceRoot);
	const available = new Set(detectPackageScripts(packageJson));
	const checks: TaskCheckResult[] = [];

	for (const id of CHECK_SCRIPT_ORDER) {
		if (!available.has(id)) {
			checks.push({
				id,
				label: CHECK_LABEL[id],
				status: "skipped",
				summary: "No package script",
			});
			continue;
		}

		const startedAt = Date.now();
		const result = await runProcess(getNpmCommand(), ["run", "-s", id], workspaceRoot);
		const output = [result.stdout.trim(), result.stderr.trim()]
			.filter((chunk) => chunk.length > 0)
			.join(" ");
		checks.push({
			id,
			label: CHECK_LABEL[id],
			status: result.exitCode === 0 ? "passed" : "failed",
			summary:
				output.length > 0
					? truncateInline(output, 140)
					: result.exitCode === 0
						? "Passed"
						: "Failed",
			command: `npm run -s ${id}`,
			exitCode: result.exitCode,
			durationMs: Date.now() - startedAt,
		});
	}

	return checks;
}

export async function buildTaskDiff(
	workspaceRoot: string,
	files: TaskChangedFile[],
): Promise<string> {
	if (files.length === 0) {
		return "No changed files.";
	}

	const trackedFiles = files
		.filter((file) => file.status !== "untracked")
		.map((file) => file.path);
	const untrackedFiles = files.filter((file) => file.status === "untracked");
	const sections: string[] = [];

	if (trackedFiles.length > 0) {
		const trackedDiff = await runGit(
			["diff", "--", ...trackedFiles],
			workspaceRoot,
		);
		if (trackedDiff.ok && trackedDiff.result.stdout.trim().length > 0) {
			sections.push(trackedDiff.result.stdout.trim());
		}
	}

	for (const file of untrackedFiles) {
		const targetPath = path.join(workspaceRoot, file.path);
		let content: string;
		try {
			content = await fs.readFile(targetPath, "utf8");
		} catch {
			content = "(unable to read untracked file)";
		}
		sections.push(
			[
				`--- untracked: ${file.path}`,
				truncateBlock(content, 4000),
			].join("\n"),
		);
	}

	return sections.length > 0 ? sections.join("\n\n") : "No diff available.";
}

export async function commitTaskFiles(options: {
	workspaceRoot: string;
	files: TaskChangedFile[];
	message: string;
}): Promise<{ ok: boolean; message: string }> {
	if (options.files.length === 0) {
		return { ok: false, message: "No changed files to commit." };
	}

	const add = await runGit(
		["add", "-A", "--", ...options.files.map((file) => file.path)],
		options.workspaceRoot,
	);
	if (!add.ok) {
		return { ok: false, message: gitFailureMessage("git add", add.result) };
	}

	const commit = await runGit(
		["commit", "-m", options.message],
		options.workspaceRoot,
	);
	if (!commit.ok) {
		return {
			ok: false,
			message: gitFailureMessage("git commit", commit.result),
		};
	}

	return {
		ok: true,
		message: truncateInline(commit.result.stdout.trim() || "Commit created.", 240),
	};
}

export async function revertTaskFiles(options: {
	workspaceRoot: string;
	files: TaskChangedFile[];
}): Promise<{ ok: boolean; message: string }> {
	if (options.files.length === 0) {
		return { ok: false, message: "No changed files to revert." };
	}

	const tracked = options.files
		.filter((file) => file.status !== "untracked")
		.map((file) => file.path);
	const untracked = options.files
		.filter((file) => file.status === "untracked")
		.map((file) => file.path);

	if (tracked.length > 0) {
		const restore = await runGit(
			["restore", "--staged", "--worktree", "--", ...tracked],
			options.workspaceRoot,
		);
		if (!restore.ok) {
			return {
				ok: false,
				message: gitFailureMessage("git restore", restore.result),
			};
		}
	}

	for (const file of untracked) {
		await fs.rm(path.join(options.workspaceRoot, file), {
			recursive: true,
			force: true,
		});
	}

	return { ok: true, message: "Reverted touched files." };
}

export async function saveTaskReviewSummary(
	workspaceRoot: string,
	summary: TaskReviewSummary,
): Promise<void> {
	const dir = path.join(workspaceRoot, LAST_RESULT_DIR);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(
		path.join(dir, LAST_RESULT_FILE),
		JSON.stringify(summary, null, 2),
		"utf8",
	);
}

export async function markTaskRunStarted(
	workspaceRoot: string,
	prompt: string,
): Promise<void> {
	const dir = path.join(workspaceRoot, LAST_RESULT_DIR);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(
		path.join(dir, ACTIVE_RUN_FILE),
		JSON.stringify(
			{
				prompt,
				startedAt: new Date().toISOString(),
			},
			null,
			2,
		),
		"utf8",
	);
}

export async function clearTaskRunMarker(workspaceRoot: string): Promise<void> {
	await fs.rm(path.join(workspaceRoot, LAST_RESULT_DIR, ACTIVE_RUN_FILE), {
		force: true,
	});
}

export async function loadTaskReviewSummary(
	workspaceRoot: string,
): Promise<TaskReviewSummary | null> {
	try {
		const raw = await fs.readFile(
			path.join(workspaceRoot, LAST_RESULT_DIR, LAST_RESULT_FILE),
			"utf8",
		);
		return JSON.parse(raw) as TaskReviewSummary;
	} catch {
		return null;
	}
}

export async function recoverTaskReviewSummary(
	workspaceRoot: string,
): Promise<TaskReviewSummary | null> {
	const activeRun = await loadActiveRun(workspaceRoot);
	if (!activeRun) {
		return loadTaskReviewSummary(workspaceRoot);
	}

	const summary = await collectTaskReviewSummary({
		workspaceRoot,
		prompt: activeRun.prompt,
		outcome: "interrupted",
		error: "Extension restarted before task completion.",
	});
	await saveTaskReviewSummary(workspaceRoot, summary);
	await clearTaskRunMarker(workspaceRoot);
	return summary;
}

function mapGitStatus(rawStatus: string): TaskFileStatus {
	if (rawStatus === "??") return "untracked";
	if (rawStatus.includes("R")) return "renamed";
	if (rawStatus.includes("A")) return "added";
	if (rawStatus.includes("D")) return "deleted";
	return "modified";
}

function isTelecodeMetaFile(filePath: string): boolean {
	return filePath === ".telecode" || filePath.startsWith(".telecode/");
}

function extractBranchFromStatus(line: string): string | null {
	if (!line.startsWith("## ")) {
		return null;
	}
	const raw = line.slice(3).trim();
	const branch = raw.split("...")[0]?.trim() || raw;
	return branch.length > 0 ? branch : null;
}

async function readPackageJson(workspaceRoot: string): Promise<string | null> {
	try {
		return await fs.readFile(path.join(workspaceRoot, "package.json"), "utf8");
	} catch {
		return null;
	}
}

async function loadActiveRun(
	workspaceRoot: string,
): Promise<{ prompt: string; startedAt: string } | null> {
	try {
		const raw = await fs.readFile(
			path.join(workspaceRoot, LAST_RESULT_DIR, ACTIVE_RUN_FILE),
			"utf8",
		);
		const parsed = JSON.parse(raw) as { prompt?: string; startedAt?: string };
		if (typeof parsed.prompt !== "string" || typeof parsed.startedAt !== "string") {
			return null;
		}
		return { prompt: parsed.prompt, startedAt: parsed.startedAt };
	} catch {
		return null;
	}
}

function getNpmCommand(): string {
	return process.platform === "win32" ? "npm.cmd" : "npm";
}

function truncateInline(text: string, maxChars: number): string {
	return text.length > maxChars ? `${text.slice(0, maxChars - 3)}...` : text;
}

function truncateBlock(text: string, maxChars: number): string {
	return text.length > maxChars
		? `${text.slice(0, maxChars)}\n\n... trimmed ...`
		: text;
}

function gitFailureMessage(step: string, result: CommandResult): string {
	const detail = [result.stdout.trim(), result.stderr.trim()]
		.filter((chunk) => chunk.length > 0)
		.join(" ");
	return `${step} failed${detail ? `: ${truncateInline(detail, 240)}` : "."}`;
}

async function runGit(
	args: string[],
	cwd: string,
): Promise<{ ok: boolean; result: CommandResult }> {
	const result = await runProcess("git", args, cwd);
	return { ok: result.exitCode === 0, result };
}

async function runProcess(
	command: string,
	args: string[],
	cwd: string,
): Promise<CommandResult> {
	return new Promise<CommandResult>((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			env: process.env,
		});
		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (chunk: Buffer | string) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer | string) => {
			stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (exitCode) => {
			resolve({
				stdout,
				stderr,
				exitCode,
			});
		});
	});
}
