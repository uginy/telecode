import * as vscode from "vscode";

const POSTHOG_API_KEY = "phc_Ag28r6UEH7rBqCz3ANvsBP4md23ybDrSK5aqrMyFb2wN";
const POSTHOG_HOST = "https://us.i.posthog.com";
const ANON_ID_STORAGE_KEY = "telecode.telemetry.anonymousId";

export class TelemetryService {
	private static instance: TelemetryService | null = null;
	private anonymousId: string;
	private extensionVersion: string;

	private constructor(
		private readonly context: vscode.ExtensionContext,
		extensionVersion: string,
	) {
		this.extensionVersion = extensionVersion;
		let storedId = context.globalState.get<string>(ANON_ID_STORAGE_KEY);
		if (!storedId) {
			storedId = vscode.env.sessionId || "tc_" + Math.random().toString(36).substring(2, 15);
			void context.globalState.update(ANON_ID_STORAGE_KEY, storedId);
		}
		this.anonymousId = storedId;
	}

	public static init(
		context: vscode.ExtensionContext,
		extensionVersion: string,
	): TelemetryService {
		if (!TelemetryService.instance) {
			TelemetryService.instance = new TelemetryService(context, extensionVersion);
		}
		return TelemetryService.instance;
	}

	public static get(): TelemetryService | null {
		return TelemetryService.instance;
	}

	public capture(event: string, properties: Record<string, unknown> = {}): void {
		// Strict adherence to VS Code user privacy settings
		if (!vscode.env.isTelemetryEnabled) {
			return;
		}

		const payload = {
			api_key: POSTHOG_API_KEY,
			event,
			distinct_id: this.anonymousId,
			properties: {
				$os: process.platform,
				$lib: "telecode-vscode",
				vscode_version: vscode.version,
				vscode_app_name: vscode.env.appName,
				vscode_ui_kind: vscode.env.uiKind === vscode.UIKind.Web ? "web" : "desktop",
				extension_version: this.extensionVersion,
				...properties,
			},
			timestamp: new Date().toISOString(),
		};

		// Fire-and-forget via native fetch with 3s timeout
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 3000);

			void fetch(`${POSTHOG_HOST}/capture/`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
				signal: controller.signal,
			})
				.catch(() => {
					// Silent fail: telemetry must never interrupt extension operation
				})
				.finally(() => {
					clearTimeout(timeoutId);
				});
		} catch {
			// Ignore any unexpected synchronous errors
		}
	}
}
