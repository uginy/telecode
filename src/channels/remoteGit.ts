import { spawn } from "node:child_process";

export async function executeRemoteGitCommand(
	workspaceRoot: string,
	input: string,
): Promise<string> {
	const trimmed = input.trim();
	if (!trimmed || trimmed === "status") {
		return runGit(workspaceRoot, ["status", "--short", "--branch"]);
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
