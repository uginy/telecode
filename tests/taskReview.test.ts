import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildTaskSummaryText,
	clearTaskRunMarker,
	collectTaskReviewSummary,
	commitTaskFiles,
	detectPackageScripts,
	loadTaskReviewSummary,
	markTaskRunStarted,
	parseGitStatusPorcelain,
	recoverTaskReviewSummary,
	revertTaskFiles,
	saveTaskReviewSummary,
	summarizeChecks,
	type TaskCheckResult,
} from "../src/extension/taskReview";

describe("taskReview", () => {
	it("parses porcelain git status into changed files", () => {
		expect(
			parseGitStatusPorcelain(
				[
					"## main",
					" M src/extension.ts",
					"A  src/new.ts",
					"?? tests/tmp.ts",
					"?? .telecode/last-result.json",
					"R  old.ts -> new.ts",
				].join("\n"),
			),
		).toEqual([
			{ path: "src/extension.ts", rawStatus: " M", status: "modified" },
			{ path: "src/new.ts", rawStatus: "A ", status: "added" },
			{ path: "tests/tmp.ts", rawStatus: "??", status: "untracked" },
			{ path: "new.ts", rawStatus: "R ", status: "renamed" },
		]);
	});

	it("detects supported package scripts", () => {
		expect(
			detectPackageScripts(
				JSON.stringify({
					scripts: {
						lint: "eslint .",
						build: "tsc",
						dev: "vite",
					},
				}),
			),
		).toEqual(["lint", "build"]);
	});

	it("builds readable check and task summaries", () => {
		const checks: TaskCheckResult[] = [
			{ id: "lint", label: "Lint", status: "passed", summary: "ok" },
			{ id: "build", label: "Build", status: "failed", summary: "failed" },
			{ id: "test", label: "Tests", status: "skipped", summary: "missing" },
		];
		expect(summarizeChecks(checks)).toBe("1 passed • 1 failed • 1 skipped");
		expect(
			buildTaskSummaryText({
				outcome: "completed",
				hasChanges: true,
				changedFilesCount: 2,
				checks,
			}),
		).toBe("Task completed • 2 files changed • 1 passed • 1 failed • 1 skipped");
		expect(
			buildTaskSummaryText({
				outcome: "interrupted",
				hasChanges: false,
				changedFilesCount: 0,
				checks: [],
			}),
		).toBe("Task interrupted • no file changes • Checks not run");
	});

	it("collects task summary and persists it", async () => {
		const workspaceRoot = await createGitWorkspace();
		const filePath = path.join(workspaceRoot, "notes.txt");
		await fs.writeFile(filePath, "updated\n", "utf8");

		const summary = await collectTaskReviewSummary({
			workspaceRoot,
			prompt: "update notes",
			outcome: "completed",
		});

		expect(summary.hasChanges).toBe(true);
		expect(summary.changedFiles).toEqual([
			{ path: "notes.txt", rawStatus: " M", status: "modified" },
		]);

		await saveTaskReviewSummary(workspaceRoot, summary);
		await expect(loadTaskReviewSummary(workspaceRoot)).resolves.toEqual(summary);
	});

	it("commits and reverts touched files", async () => {
		const workspaceRoot = await createGitWorkspace();
		const trackedPath = path.join(workspaceRoot, "notes.txt");
		const untrackedPath = path.join(workspaceRoot, "draft.txt");
		await fs.writeFile(trackedPath, "updated\n", "utf8");
		await fs.writeFile(untrackedPath, "draft\n", "utf8");

		const pending = await collectTaskReviewSummary({
			workspaceRoot,
			prompt: "edit notes",
			outcome: "completed",
		});
		expect(pending.changedFiles).toHaveLength(2);

		const commit = await commitTaskFiles({
			workspaceRoot,
			files: pending.changedFiles,
			message: "test: commit touched files",
		});
		expect(commit.ok).toBe(true);

		const afterCommit = await collectTaskReviewSummary({
			workspaceRoot,
			prompt: "edit notes",
			outcome: "completed",
		});
		expect(afterCommit.changedFiles).toHaveLength(0);

		await fs.writeFile(trackedPath, "changed again\n", "utf8");
		await fs.writeFile(untrackedPath, "draft again\n", "utf8");
		const toRevert = await collectTaskReviewSummary({
			workspaceRoot,
			prompt: "edit again",
			outcome: "completed",
		});

		const revert = await revertTaskFiles({
			workspaceRoot,
			files: toRevert.changedFiles,
		});
		expect(revert.ok).toBe(true);
		await expect(fs.readFile(trackedPath, "utf8")).resolves.toBe("updated\n");
		await expect(fs.readFile(untrackedPath, "utf8")).resolves.toBe("draft\n");
	});

	it("recovers interrupted run marker on startup", async () => {
		const workspaceRoot = await createGitWorkspace();
		await fs.writeFile(path.join(workspaceRoot, "notes.txt"), "pending\n", "utf8");
		await markTaskRunStarted(workspaceRoot, "resume me");

		const recovered = await recoverTaskReviewSummary(workspaceRoot);
		expect(recovered?.outcome).toBe("interrupted");
		expect(recovered?.prompt).toBe("resume me");
		expect(recovered?.error).toContain("restarted");
		expect(recovered?.changedFiles).toEqual([
			{ path: "notes.txt", rawStatus: " M", status: "modified" },
		]);
		await clearTaskRunMarker(workspaceRoot);
	});
});

async function createGitWorkspace(): Promise<string> {
	const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "telecode-review-"));
	execFileSync("git", ["init"], { cwd: workspaceRoot });
	execFileSync("git", ["config", "user.name", "TeleCode Tests"], { cwd: workspaceRoot });
	execFileSync("git", ["config", "user.email", "telecode@example.com"], { cwd: workspaceRoot });
	await fs.writeFile(path.join(workspaceRoot, "package.json"), JSON.stringify({ name: "tmp" }), "utf8");
	await fs.writeFile(path.join(workspaceRoot, "notes.txt"), "initial\n", "utf8");
	execFileSync("git", ["add", "."], { cwd: workspaceRoot });
	execFileSync("git", ["commit", "-m", "init"], { cwd: workspaceRoot });
	return workspaceRoot;
}
