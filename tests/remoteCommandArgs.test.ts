import { describe, expect, it } from "vitest";
import {
	parseHistoryArgs,
	parseScheduleCommand,
	parseTaskSelector,
} from "../src/channels/remoteCommandArgs";

describe("remote command args", () => {
	it("parses history filters", () => {
		expect(
			parseHistoryArgs("15 failed telegram bugfix", {
				limit: 10,
				maxLimit: 20,
				channel: "whatsapp",
			}),
		).toEqual({
			limit: 15,
			status: "failed",
			channel: "telegram",
			text: "bugfix",
		});
	});

	it("parses task selectors", () => {
		expect(parseTaskSelector("")).toEqual({ kind: "last" });
		expect(parseTaskSelector("active")).toEqual({ kind: "active" });
		expect(parseTaskSelector("42")).toEqual({ id: 42 });
		expect(parseTaskSelector("weird")).toBeNull();
	});

	it("parses schedule commands", () => {
		expect(parseScheduleCommand("")).toEqual({ kind: "list" });
		expect(parseScheduleCommand("every 15 run checks")).toEqual({
			kind: "add",
			intervalMinutes: 15,
			prompt: "run checks",
		});
		expect(parseScheduleCommand("pause 4")).toEqual({ kind: "pause", id: 4 });
		expect(parseScheduleCommand("oops")).toBeNull();
	});
});
