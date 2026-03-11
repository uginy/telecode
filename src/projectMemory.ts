import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

const STORE_DIR = ".telecode";
const STORE_FILE = "project-memory.md";
const MAX_PROMPT_MEMORY_CHARS = 4000;

export function getProjectMemoryPath(workspaceRoot: string): string {
	return path.join(workspaceRoot, STORE_DIR, STORE_FILE);
}

export async function loadProjectMemory(workspaceRoot: string): Promise<string> {
	try {
		return normalizeMemoryText(
			await fsp.readFile(getProjectMemoryPath(workspaceRoot), "utf8"),
		);
	} catch {
		return "";
	}
}

export function loadProjectMemorySync(workspaceRoot: string): string {
	try {
		return normalizeMemoryText(
			fs.readFileSync(getProjectMemoryPath(workspaceRoot), "utf8"),
		);
	} catch {
		return "";
	}
}

export async function appendProjectMemoryNote(
	workspaceRoot: string,
	note: string,
): Promise<string> {
	const normalized = normalizeMemoryText(note);
	if (!normalized) {
		return loadProjectMemory(workspaceRoot);
	}
	const current = await loadProjectMemory(workspaceRoot);
	const next = [current, `- ${normalized}`].filter(Boolean).join("\n");
	await saveProjectMemory(workspaceRoot, next);
	return next;
}

export async function saveProjectMemory(
	workspaceRoot: string,
	text: string,
): Promise<void> {
	const normalized = normalizeMemoryText(text);
	await fsp.mkdir(path.join(workspaceRoot, STORE_DIR), { recursive: true });
	await fsp.writeFile(getProjectMemoryPath(workspaceRoot), normalized, "utf8");
}

export async function clearProjectMemory(workspaceRoot: string): Promise<void> {
	await fsp.rm(getProjectMemoryPath(workspaceRoot), { force: true });
}

export function getProjectMemoryForPrompt(workspaceRoot: string): string {
	const text = loadProjectMemorySync(workspaceRoot);
	if (!text) {
		return "";
	}
	return text.length > MAX_PROMPT_MEMORY_CHARS
		? text.slice(-MAX_PROMPT_MEMORY_CHARS)
		: text;
}

function normalizeMemoryText(text: string): string {
	return text
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((line) => line.trim())
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
