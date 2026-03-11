import { describe, expect, it } from "vitest";
import {
	extractWhatsappMessageId,
	extractWhatsappMessageText,
	normalizeWhatsappMessageText,
	parseWhatsappCommand,
	splitWhatsappText,
	summarizeWhatsappToolPayload,
} from "../src/channels/whatsapp/messageUtils";

describe("whatsapp message utils", () => {
	it("splits long text and keeps empty input as Done", () => {
		expect(splitWhatsappText("")).toEqual(["Done."]);
		expect(splitWhatsappText("abcdef", 2)).toEqual(["ab", "cd", "ef"]);
	});

	it("parses commands and extracts message fields", () => {
		expect(parseWhatsappCommand("/help")).toBe("help");
		expect(parseWhatsappCommand("/review")).toBe("review");
		expect(parseWhatsappCommand("/checks")).toBe("checks");
		expect(parseWhatsappCommand("/commit chore: update")).toBe("commit");
		expect(parseWhatsappCommand("/revert")).toBe("revert");
		expect(parseWhatsappCommand("/run refactor")).toBe("run");
		expect(parseWhatsappCommand("plain text")).toBeNull();
		expect(
			extractWhatsappMessageText({
				key: {},
				message: { extendedTextMessage: { text: " hello " } },
			}),
		).toBe("hello");
		expect(extractWhatsappMessageId({ key: { id: "abc" } as never })).toBe("abc");
	});

	it("normalizes text and summarizes nested tool payload", () => {
		expect(normalizeWhatsappMessageText("  Hello   WORLD ")).toBe(
			"hello world",
		);
		expect(
			summarizeWhatsappToolPayload({
				details: { path: "/tmp/file", replacements: 2 },
			}),
		).toContain("path=/tmp/file");
	});
});
