import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTaskArtifacts } from "../src/extension/taskArtifacts";
import type { TaskReviewSummary } from "../src/extension/taskReview";

describe("task artifacts", () => {
	it("writes review artifacts for a task", async () => {
		const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "telecode-artifacts-"));
		await fs.writeFile(path.join(workspaceRoot, "demo.ts"), "console.log('hi');\n", "utf8");

		const review: TaskReviewSummary = {
			prompt: "touch demo",
			outcome: "completed",
			summary: "Task completed • 1 file changed • Checks not run",
			completedAt: new Date().toISOString(),
			branch: "main",
			gitAvailable: true,
			hasChanges: true,
			canCommit: true,
			changedFiles: [{ path: "demo.ts", status: "modified", rawStatus: " M" }],
			checks: [],
		};

		const artifacts = await createTaskArtifacts({
			workspaceRoot,
			taskId: 7,
			review,
		});

		expect(artifacts.map((item) => item.kind)).toEqual([
			"review",
			"files",
			"checks",
			"diff",
		]);
		const reviewText = await fs.readFile(
			path.join(workspaceRoot, artifacts[0].relativePath),
			"utf8",
		);
		expect(reviewText).toContain("Last task completed");
	});
});
