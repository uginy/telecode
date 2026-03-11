import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildComposedSystemPrompt } from "../src/prompts/promptStack";

const createdDirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("promptStack", () => {
	it("loads bundled prompt layers even when workspace has no prompts directory", () => {
		const result = buildComposedSystemPrompt({
			cwd: "/tmp/telecode-workspace-without-prompts",
			maxSteps: 5,
			tools: [],
			responseStyle: "concise",
			language: "en",
			allowOutOfWorkspace: false,
		});

		expect(result.source).toBe("stack");
		expect(result.layerCount).toBeGreaterThan(0);
		expect(result.prompt).toContain("# Runtime Context");
		expect(result.prompt).toContain("Workspace root: /tmp/telecode-workspace-without-prompts");
	});

	it("injects workspace project memory into the prompt", async () => {
		const workspaceRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "telecode-prompt-stack-"),
		);
		createdDirs.push(workspaceRoot);
		await fs.mkdir(path.join(workspaceRoot, ".telecode"), { recursive: true });
		await fs.writeFile(
			path.join(workspaceRoot, ".telecode", "project-memory.md"),
			"- keep checks green",
			"utf8",
		);

		const result = buildComposedSystemPrompt({
			cwd: workspaceRoot,
			maxSteps: 5,
			tools: [],
			responseStyle: "concise",
			language: "en",
			allowOutOfWorkspace: false,
		});

		expect(result.prompt).toContain("# Project Memory");
		expect(result.prompt).toContain("- keep checks green");
	});
});
