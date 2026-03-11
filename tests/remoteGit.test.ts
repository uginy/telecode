import { describe, expect, it } from "vitest";
import { renderRemoteGitStatus } from "../src/channels/remoteGit";

describe("remote git", () => {
	it("renders human-readable status and hides telecode files", () => {
		const text = renderRemoteGitStatus(
			[
				"## dev...origin/dev",
				"?? .telecode/",
				"?? tmp-test.txt",
				" M src/app.ts",
			].join("\n"),
		);

		expect(text).toContain("On branch dev");
		expect(text).toContain("- untracked: tmp-test.txt");
		expect(text).toContain("- modified: src/app.ts");
		expect(text).not.toContain(".telecode");
		expect(text).not.toContain("??");
	});
});
