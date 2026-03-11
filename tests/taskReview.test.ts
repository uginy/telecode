import { describe, expect, it } from "vitest";
import {
	buildTaskSummaryText,
	detectPackageScripts,
	parseGitStatusPorcelain,
	summarizeChecks,
	type TaskCheckResult,
} from "../src/extension/taskReview";

describe("taskReview", () => {
	it("parses porcelain git status into changed files", () => {
		expect(
			parseGitStatusPorcelain(
				["## main", " M src/extension.ts", "A  src/new.ts", "?? tests/tmp.ts", "R  old.ts -> new.ts"].join("\n"),
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
	});
});
