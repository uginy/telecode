/**
 * Single source of truth for the providers TeleCode offers in its settings UI.
 * Pure data: imported by both the extension host and the webview bundle, so it must not import pi-ai.
 */

/** "cli" runs a locally installed agent CLI on the user's own subscription login instead of pi-ai. */
export type ProviderKind = "cli" | "api" | "local" | "custom";

export interface ProviderOption {
	id: string;
	label: string;
	kind: ProviderKind;
	/** OpenAI-compatible endpoint used when the provider has no dedicated pi-ai factory. */
	baseUrl?: string;
	/** Runs without an API key (local servers). */
	keyless?: boolean;
	/** Model preselected when switching to this provider. */
	defaultModel?: string;
}

export const PROVIDER_CATALOG: readonly ProviderOption[] = [
	{ id: "claude-code", label: "Claude Code CLI (Claude subscription)", kind: "cli", keyless: true, defaultModel: "default" },
	{ id: "codex", label: "Codex CLI (ChatGPT subscription)", kind: "cli", keyless: true, defaultModel: "default" },
	{ id: "antigravity", label: "Antigravity CLI (Google subscription)", kind: "cli", keyless: true, defaultModel: "default" },
	{ id: "openrouter", label: "OpenRouter", kind: "api", defaultModel: "openrouter/free" },
	{ id: "openai", label: "OpenAI", kind: "api" },
	{ id: "anthropic", label: "Anthropic (Claude)", kind: "api" },
	{ id: "google", label: "Google Gemini", kind: "api" },
	{ id: "xai", label: "xAI (Grok)", kind: "api" },
	{ id: "deepseek", label: "DeepSeek", kind: "api" },
	{ id: "mistral", label: "Mistral", kind: "api" },
	{ id: "groq", label: "Groq", kind: "api" },
	{ id: "cerebras", label: "Cerebras", kind: "api" },
	{ id: "moonshotai", label: "Moonshot AI (Kimi API)", kind: "api" },
	{ id: "kimi-coding", label: "Kimi For Coding", kind: "api" },
	{ id: "minimax", label: "MiniMax", kind: "api" },
	{ id: "zai", label: "Z.AI (GLM Coding Plan)", kind: "api" },
	{ id: "fireworks", label: "Fireworks", kind: "api" },
	{ id: "together", label: "Together AI", kind: "api" },
	{ id: "ollama", label: "Ollama", kind: "local", keyless: true, baseUrl: "http://localhost:11434/v1" },
	{ id: "lmstudio", label: "LM Studio", kind: "local", keyless: true, baseUrl: "http://localhost:1234/v1" },
	{ id: "custom", label: "Custom (OpenAI-compatible)", kind: "custom", keyless: true },
];

/** Old free-text values that map onto catalog ids. */
const PROVIDER_ALIAS: Record<string, string> = {
	kimi: "kimi-coding",
	moonshot: "moonshotai",
};

export function isCliProvider(provider: string): boolean {
	return findProvider(provider)?.kind === "cli";
}

export function normalizeProvider(provider: string): string {
	const trimmed = provider.trim().toLowerCase();
	return PROVIDER_ALIAS[trimmed] ?? trimmed;
}

export function findProvider(provider: string): ProviderOption | undefined {
	const id = normalizeProvider(provider);
	return PROVIDER_CATALOG.find((option) => option.id === id);
}

/** Unknown ids are treated as custom OpenAI-compatible endpoints, which may run keyless. */
export function providerRequiresApiKey(provider: string): boolean {
	const option = findProvider(provider);
	return option ? option.keyless !== true : false;
}
