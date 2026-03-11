import * as fs from "node:fs/promises";
import * as path from "node:path";
import { buildTaskDiff, type TaskReviewSummary } from "./taskReview";
import type { RemoteTaskArtifact } from "../channels/remoteTasks";

const ARTIFACTS_DIR = ".telecode/artifacts";

export async function createTaskArtifacts(options: {
	workspaceRoot: string;
	taskId: number;
	review: TaskReviewSummary;
}): Promise<RemoteTaskArtifact[]> {
	const dir = path.join(options.workspaceRoot, ARTIFACTS_DIR, `task-${options.taskId}`);
	await fs.mkdir(dir, { recursive: true });

	const reviewPath = path.join(dir, "review.txt");
	const filesPath = path.join(dir, "files.txt");
	const checksPath = path.join(dir, "checks.txt");
	await fs.writeFile(reviewPath, renderReview(options.review), "utf8");
	await fs.writeFile(filesPath, renderFiles(options.review), "utf8");
	await fs.writeFile(checksPath, renderChecks(options.review), "utf8");

	const artifacts: RemoteTaskArtifact[] = [
		makeArtifact(options.workspaceRoot, reviewPath, "review", "Review"),
		makeArtifact(options.workspaceRoot, filesPath, "files", "Changed files"),
		makeArtifact(options.workspaceRoot, checksPath, "checks", "Checks"),
	];

	if (options.review.changedFiles.length > 0) {
		const diffText = await buildTaskDiff(
			options.workspaceRoot,
			options.review.changedFiles,
		);
		const diffPath = path.join(dir, "diff.patch");
		await fs.writeFile(diffPath, diffText, "utf8");
		artifacts.push(makeArtifact(options.workspaceRoot, diffPath, "diff", "Diff"));
	}

	return artifacts;
}

function makeArtifact(
	workspaceRoot: string,
	absolutePath: string,
	kind: RemoteTaskArtifact["kind"],
	label: string,
): RemoteTaskArtifact {
	return {
		kind,
		label,
		relativePath: path.relative(workspaceRoot, absolutePath),
		fileName: path.basename(absolutePath),
		mimeType: "text/plain",
	};
}

function renderReview(review: TaskReviewSummary): string {
	const lines = [
		review.outcome === "completed"
			? "Last task completed"
			: review.outcome === "failed"
				? "Last task failed"
				: "Last task interrupted",
		review.summary,
		review.branch ? `Branch: ${review.branch}` : "Branch: -",
		`Completed: ${review.completedAt}`,
		`Prompt: ${review.prompt}`,
	];

	if (review.error) {
		lines.push(`Error: ${review.error}`);
	}

	return lines.join("\n");
}

function renderFiles(review: TaskReviewSummary): string {
	if (review.changedFiles.length === 0) {
		return "No changed files.";
	}
	return review.changedFiles
		.map((file) => `${file.status}: ${file.path}`)
		.join("\n");
}

function renderChecks(review: TaskReviewSummary): string {
	if (review.checks.length === 0) {
		return "Checks: not run";
	}
	return review.checks
		.map(
			(check) =>
				`${check.label}: ${check.status}${check.summary ? ` (${check.summary})` : ""}`,
		)
		.join("\n");
}
