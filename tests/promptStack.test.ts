import { describe, expect, it } from "vitest";
import { buildComposedSystemPrompt } from "../src/prompts/promptStack";

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
});
