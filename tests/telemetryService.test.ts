import { beforeEach, describe, expect, it, vi } from "vitest";

const { envState } = vi.hoisted(() => ({
	envState: {
		isTelemetryEnabled: true,
		appName: "Visual Studio Code",
		sessionId: "test-session-id",
		uiKind: 1,
	},
}));

vi.mock("vscode", () => ({
	version: "1.90.0",
	UIKind: { Desktop: 1, Web: 2 },
	env: envState,
}));

import { TelemetryService } from "../src/telemetry/telemetryService";

describe("TelemetryService", () => {
	const storage = new Map<string, unknown>();
	const mockContext = {
		globalState: {
			get: vi.fn((key: string) => storage.get(key)),
			update: vi.fn(async (key: string, val: unknown) => {
				storage.set(key, val);
			}),
		},
	};

	beforeEach(() => {
		storage.clear();
		envState.isTelemetryEnabled = true;
		vi.restoreAllMocks();
	});

	it("captures event when telemetry is enabled", async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true });
		vi.stubGlobal("fetch", fetchMock);

		const service = TelemetryService.init(mockContext as never, "0.1.23");
		service.capture("extension_activated", { source: "test" });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, options] = fetchMock.mock.calls[0];
		expect(url).toBe("https://us.i.posthog.com/capture/");
		expect(options.method).toBe("POST");

		const body = JSON.parse(options.body);
		expect(body.event).toBe("extension_activated");
		expect(body.api_key).toBe("phc_Ag28r6UEH7rBqCz3ANvsBP4md23ybDrSK5aqrMyFb2wN");
		expect(body.properties.source).toBe("test");
		expect(body.properties.extension_version).toBe("0.1.23");
		expect(body.properties.vscode_version).toBe("1.90.0");
	});

	it("does not send event when telemetry is disabled", () => {
		envState.isTelemetryEnabled = false;
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const service = TelemetryService.init(mockContext as never, "0.1.23");
		service.capture("extension_activated");

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("silently catches network failures", () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error("Network offline"));
		vi.stubGlobal("fetch", fetchMock);

		const service = TelemetryService.init(mockContext as never, "0.1.23");
		expect(() => {
			service.capture("task_started");
		}).not.toThrow();
	});
});
