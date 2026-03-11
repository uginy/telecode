import { describe, expect, it } from "vitest";
import {
	renderWhatsappHelp,
	renderWhatsappStartupMessage,
	renderWhatsappStatus,
} from "../src/channels/whatsapp/presentation";

describe("whatsapp presentation", () => {
	it("renders help and status text", () => {
		expect(renderWhatsappHelp()).toContain("/run <task>");
		expect(renderWhatsappStatus(true)).toBe("Agent status: running");
		expect(renderWhatsappStatus(false)).toBe("Agent status: ready");
	});

	it("renders startup message by language preference", () => {
		expect(
			renderWhatsappStartupMessage({ language: "ru", uiLanguage: "en" }),
		).toContain("подключен");
		expect(
			renderWhatsappStartupMessage({ language: "en", uiLanguage: "ru" }),
		).toContain("connected");
		expect(
			renderWhatsappStartupMessage({ language: "auto", uiLanguage: "en" }),
		).toContain("connected");
	});
});
