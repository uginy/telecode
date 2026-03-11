export function installLlmFetchLogger(
	onLog: (line: string) => void,
): (() => void) | null {
	const originalFetch = globalThis.fetch;
	if (typeof originalFetch !== "function") {
		return null;
	}

	globalThis.fetch = (async (input: unknown, init?: unknown) => {
		const { url, method } = extractRequestInfo(input, init);
		const isTelegram = url.toLowerCase().includes("api.telegram.org");
		const shouldLog = shouldLogLlmRequest(url);
		const startedAt = Date.now();

		try {
			const fetchArgs = isTelegram
				? buildTelegramFetchArgs(input, init, url, method)
				: { input, init };
			const response = await originalFetch(
				fetchArgs.input as never,
				fetchArgs.init as never,
			);
			if (shouldLog) {
				const elapsed = Date.now() - startedAt;
				onLog(
					`[llm:res] ${response.status} ${method} ${safeUrlForLog(
						url,
					)} ${elapsed}ms`,
				);
			}
			return response;
		} catch (error) {
			if (shouldLog) {
				const elapsed = Date.now() - startedAt;
				const message = error instanceof Error ? error.message : String(error);
				onLog(
					`[llm:error] ${method} ${safeUrlForLog(
						url,
					)} ${elapsed}ms ${message}`,
				);
			}
			throw error;
		}
	}) as typeof fetch;

	return () => {
		globalThis.fetch = originalFetch;
	};
}

function sanitizeTelegramFetchInit(init?: unknown): unknown {
	if (!init || typeof init !== "object") {
		return init;
	}
	const maybeInit = init as Record<string, unknown>;
	if (!("signal" in maybeInit)) {
		return init;
	}
	// grammY can pass a signal object from a different realm/package.
	// undici then throws "Expected signal to be an instanceof AbortSignal".
	// Telegram checks are short requests, so dropping signal here is safe and
	// prevents startup from failing.
	const { signal, ...rest } = maybeInit;
	void signal;
	return rest;
}

function buildTelegramFetchArgs(
	input: unknown,
	init: unknown,
	url: string,
	method: string,
): { input: unknown; init: unknown } {
	const sanitizedInit = sanitizeTelegramFetchInit(init);
	if (typeof Request !== "undefined" && input instanceof Request) {
		const reqInit: Record<string, unknown> = {};
		reqInit.method = method || input.method || "GET";
		if (input.headers) reqInit.headers = input.headers;
		if (
			sanitizedInit &&
			typeof sanitizedInit === "object" &&
			"body" in (sanitizedInit as Record<string, unknown>)
		) {
			reqInit.body = (sanitizedInit as Record<string, unknown>).body;
		}
		const merged =
			sanitizedInit && typeof sanitizedInit === "object"
				? { ...reqInit, ...(sanitizedInit as Record<string, unknown>) }
				: reqInit;
		return { input: url, init: merged };
	}
	return { input, init: sanitizedInit };
}

function extractRequestInfo(
	input: unknown,
	init?: unknown,
): { url: string; method: string } {
	let url = "(unknown-url)";
	let method = "GET";

	if (typeof input === "string") {
		url = input;
	} else if (input instanceof URL) {
		url = input.toString();
	} else if (input && typeof input === "object") {
		const requestLike = input as { url?: string; method?: string };
		if (typeof requestLike.url === "string") {
			url = requestLike.url;
		}
		if (
			typeof requestLike.method === "string" &&
			requestLike.method.length > 0
		) {
			method = requestLike.method.toUpperCase();
		}
	}

	if (init && typeof init === "object") {
		const initLike = init as { method?: string };
		if (typeof initLike.method === "string" && initLike.method.length > 0) {
			method = initLike.method.toUpperCase();
		}
	}

	return { url, method };
}

function shouldLogLlmRequest(url: string): boolean {
	if (!url || url === "(unknown-url)") {
		return false;
	}

	const normalized = url.toLowerCase();
	if (
		normalized.includes("api.telegram.org") ||
		normalized.startsWith("vscode-webview://") ||
		normalized.startsWith("file://")
	) {
		return false;
	}

	return (
		normalized.includes("/v1/chat/completions") ||
		normalized.includes("/v1/responses") ||
		normalized.includes("/chat/completions") ||
		normalized.includes("/responses") ||
		normalized.includes("openrouter.ai") ||
		normalized.includes("moonshot.ai") ||
		normalized.includes("deepseek.com") ||
		normalized.includes("api.openai.com") ||
		normalized.includes("anthropic.com")
	);
}

function safeUrlForLog(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.origin}${parsed.pathname}`;
	} catch {
		return url.split("?")[0];
	}
}
