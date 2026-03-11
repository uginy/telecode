import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: () => ({
			get: () => undefined,
		}),
	},
	env: {
		language: "en",
	},
}));

import {
	getAggregatedChannelStatus,
	getEffectiveStatus,
	getStatusPriority,
	shouldPreferLocalStatus,
} from "../src/extension/uiStatusController";

describe("uiStatusController", () => {
	it("prefers local busy status over passive channel statuses", () => {
		expect(getEffectiveStatus("Running", ["Idle", "Ready"])).toBe("Running");
	});

	it("prefers highest-priority channel status when local status is passive", () => {
		expect(getEffectiveStatus("Idle", ["Idle", "Connecting", "Ready"])).toBe(
			"Connecting",
		);
	});

	it("collapses multiple busy channel states into a stable aggregate label", () => {
		expect(
			getAggregatedChannelStatus(["Running: Telegram", "Connecting"]),
		).toBe("Channels active");
	});

	it("keeps matching busy channel status as-is", () => {
		expect(getAggregatedChannelStatus(["Connecting", "Connecting"])).toBe(
			"Connecting",
		);
	});

	it("exposes expected priority ordering", () => {
		expect(getStatusPriority("Error")).toBeGreaterThan(
			getStatusPriority("Connecting"),
		);
		expect(getStatusPriority("Connecting")).toBeGreaterThan(
			getStatusPriority("Ready"),
		);
	});

	it("treats busy and terminal local states as dominant", () => {
		expect(shouldPreferLocalStatus("Running")).toBe(true);
		expect(shouldPreferLocalStatus("Stopped")).toBe(true);
		expect(shouldPreferLocalStatus("Error")).toBe(true);
		expect(shouldPreferLocalStatus("Idle")).toBe(false);
	});
});
