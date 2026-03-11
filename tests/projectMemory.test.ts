import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	appendProjectMemoryNote,
	clearProjectMemory,
	getProjectMemoryForPrompt,
	loadProjectMemory,
	saveProjectMemory,
} from "../src/projectMemory";

const createdDirs: string[] = [];

async function createWorkspace(): Promise<string> {
	const workspaceRoot = await fs.mkdtemp(
		path.join(os.tmpdir(), "telecode-project-memory-"),
	);
	createdDirs.push(workspaceRoot);
	return workspaceRoot;
}

afterEach(async () => {
	await Promise.all(
		createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("projectMemory", () => {
	it("appends, loads and clears workspace notes", async () => {
		const workspaceRoot = await createWorkspace();

		await appendProjectMemoryNote(workspaceRoot, "  keep ci green  ");
		await appendProjectMemoryNote(workspaceRoot, "use pnpm only");

		expect(await loadProjectMemory(workspaceRoot)).toBe(
			"- keep ci green\n- use pnpm only",
		);

		await clearProjectMemory(workspaceRoot);
		expect(await loadProjectMemory(workspaceRoot)).toBe("");
	});

	it("trims prompt memory to the latest chunk", async () => {
		const workspaceRoot = await createWorkspace();
		await saveProjectMemory(workspaceRoot, `start\n${"x".repeat(5000)}tail`);

		const promptMemory = getProjectMemoryForPrompt(workspaceRoot);
		expect(promptMemory.length).toBeLessThanOrEqual(4000);
		expect(promptMemory.endsWith("tail")).toBe(true);
	});
});
