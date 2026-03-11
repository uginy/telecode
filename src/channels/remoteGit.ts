import { spawn } from "node:child_process";
import { parseGitStatusPorcelain } from "../extension/taskReview";

export async function executeRemoteGitCommand(
	workspaceRoot: string,
	input: string,
): Promise<string> {
	const trimmed = input.trim();
	if (!trimmed || trimmed === "status") {
		return renderRemoteGitStatus(
			await runGit(workspaceRoot, ["status", "--short", "--branch"]),
		);
	}

	const tokens = trimmed.split(/\s+/);
	if (tokens[0] === "log") {
		const count =
			tokens[1] && /^\d+$/.test(tokens[1])
				? Math.min(Math.max(Number.parseInt(tokens[1], 10), 1), 20)
				: 5;
		return runGit(workspaceRoot, ["log", `-${count}`, "--oneline", "--decorate"]);
	}

	if (tokens[0] === "show") {
		const ref = tokens.slice(1).join(" ").trim();
		if (!ref) {
			return "Usage: /git show <ref>";
		}
		return runGit(workspaceRoot, ["show", "--stat", "--summary", ref]);
	}

	return "Usage: /git <status|log [N]|show <ref>>";
}

export function renderRemoteGitStatus(output: string): string {
	const lines = output
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 0);
	const branchLine = lines.find((line) => line.startsWith("## ")) || "";
	const branch = extractBranch(branchLine);
	const changedFiles = parseGitStatusPorcelain(output);

	if (changedFiles.length === 0) {
		return branch ? `On branch ${branch}\nWorking tree clean.` : "Working tree clean.";
	}

	const header = branch ? [`On branch ${branch}`, "Changes:"] : ["Changes:"];
	return [
		...header,
		...changedFiles.map((file) => `- ${file.status}: ${file.path}`),
	].join("\n");
}

async function runGit(workspaceRoot: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn("git", args, {
			cwd: workspaceRoot,
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
		child.on("close", (code) => {
			if (code !== 0 && stderr.trim().length > 0) {
				reject(new Error(stderr.trim()));
				return;
			}
			resolve((stdout || stderr).trim() || "No output.");
		});
	});
}

function extractBranch(statusLine: string): string | null {
	if (!statusLine.startsWith("## ")) {
		return null;
	}
	const raw = statusLine.slice(3).trim();
	const branch = raw.split("...")[0]?.trim() || raw;
	return branch.length > 0 ? branch : null;
}
