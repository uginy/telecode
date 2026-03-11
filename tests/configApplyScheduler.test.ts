import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigApplyScheduler } from "../src/extension/configApplyScheduler";

function createEvent(changedKeys: string[]) {
	return {
		affectsConfiguration: (key: string) =>
			changedKeys.some((changedKey) => changedKey === key || changedKey.startsWith(`${key}.`)),
	};
}

describe("ConfigApplyScheduler", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("syncs settings and schedules channel refresh for channel config changes", async () => {
		vi.useFakeTimers();
		const scheduler = new ConfigApplyScheduler();
		const calls: string[] = [];

		scheduler.handleConfigurationChange(createEvent(["telecode.telegram"]) as never, {
			hasRuntime: false,
			syncSettings: () => calls.push("sync"),
			refreshChannels: () => calls.push("refresh"),
			restartRuntime: () => calls.push("restart"),
		});

		await vi.advanceTimersByTimeAsync(300);
		expect(calls).toEqual(["sync"]);

		await vi.advanceTimersByTimeAsync(250);
		expect(calls).toEqual(["sync", "refresh"]);
		scheduler.dispose();
	});

	it("restarts runtime for runtime-affecting config changes", async () => {
		vi.useFakeTimers();
		const scheduler = new ConfigApplyScheduler();
		const calls: string[] = [];

		scheduler.handleConfigurationChange(createEvent(["telecode.model"]) as never, {
			hasRuntime: true,
			syncSettings: () => calls.push("sync"),
			refreshChannels: () => calls.push("refresh"),
			restartRuntime: () => calls.push("restart"),
			onRestartPlanned: () => calls.push("planned"),
		});

		await vi.advanceTimersByTimeAsync(300);
		expect(calls).toEqual(["sync", "planned", "restart"]);
		scheduler.dispose();
	});
});
