import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { getSupportedThinkingLevels, type Model } from "@earendil-works/pi-ai";
import type { DiscoveredModel } from "./codingAgent";
import { normalizeProvider } from "./providerCatalog";
import { OPENAI_COMPAT_BASE_URL_BY_PROVIDER, findClosestModel, getProviderFactory } from "./providerFactories";

/** Levels every reasoning model accepts; xhigh and max are opt-in per model. */
const BASE_THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high"];
/** /models of OpenAI-style APIs also lists embedding, audio and image models the agent cannot use. */
const NON_CHAT_MODEL = /(embed|whisper|tts|dall-e|gpt-image|moderation|transcribe|audio|realtime|davinci|babbage|sora|rerank|ocr)/i;

interface ListedModel {
	id?: string;
	name?: string;
	created?: number;
	created_at?: string;
	supported_parameters?: string[];
	supportedGenerationMethods?: string[];
	pricing?: Record<string, string>;
}

function listRequest(api: string, base: string, apiKey: string): { url: string; headers: Record<string, string> } {
	const root = base.replace(/\/+$/, "");
	if (api === "anthropic-messages") {
		return { url: `${root}/v1/models?limit=1000`, headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } };
	}
	if (api === "google-generative-ai") {
		return { url: `${root}/models?pageSize=1000`, headers: { "x-goog-api-key": apiKey } };
	}
	const url = api === "mistral-conversations" ? `${root}/v1/models` : `${root}/models`;
	return { url, headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} };
}

function createdAt(model: ListedModel): number {
	return model.created ?? (model.created_at ? Date.parse(model.created_at) || 0 : 0);
}

/**
 * Live model list from the provider's API, newest first, so new releases show up without
 * a TeleCode update. The bundled pi-ai catalog is used only when no key is set yet or the
 * provider has no listing endpoint; it also supplies reasoning levels for known families.
 */
export async function discoverModels(provider: string, baseUrl: string, apiKey: string): Promise<DiscoveredModel[]> {
	const providerId = normalizeProvider(provider);
	const catalog: readonly Model<any>[] = getProviderFactory(providerId)?.().getModels() ?? [];
	const key = apiKey.trim();
	const customBase = baseUrl.trim();
	const fromCatalog = () => catalog.map((model) => ({ id: model.id, free: false, thinking: getSupportedThinkingLevels(model) }));

	// OpenRouter lists models publicly; every other provider needs the key.
	if (!key && providerId !== "openrouter" && catalog.length > 0 && !customBase) return fromCatalog();

	const template = catalog.find((model) => String(model.api).startsWith("openai")) ?? catalog[0];
	const base = customBase || OPENAI_COMPAT_BASE_URL_BY_PROVIDER[providerId] || template?.baseUrl;
	if (!base) throw new Error(`Enter the OpenAI-compatible base URL for "${provider}" to load its models.`);
	// A custom base URL is a proxy of the same API, except for ids without a native pi-ai provider.
	const api = !template || providerId in OPENAI_COMPAT_BASE_URL_BY_PROVIDER ? "openai-completions" : String(template.api);
	const request = listRequest(api, base, key);

	let response: Response;
	try {
		response = await fetch(request.url, { headers: request.headers, signal: AbortSignal.timeout(15_000) });
	} catch (error) {
		throw new Error(`Model discovery failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
	}
	if (response.status === 401 || response.status === 403) {
		throw new Error(`Model discovery failed: HTTP ${response.status}. Check the API key for ${provider}.`);
	}
	// Some providers (e.g. Anthropic-compatible gateways) have no listing endpoint.
	if (response.status === 404 && catalog.length > 0) return fromCatalog();
	if (!response.ok) throw new Error(`Model discovery failed: HTTP ${response.status}.`);

	const json = (await response.json()) as { data?: ListedModel[]; models?: ListedModel[] } | ListedModel[];
	const listed = Array.isArray(json) ? json : json.data ?? json.models;
	if (!Array.isArray(listed)) throw new Error("Model discovery returned an invalid model list.");

	const catalogLevels = new Map(catalog.map((model) => [model.id, getSupportedThinkingLevels(model)]));
	return listed
		.filter((model) => api !== "google-generative-ai" || model.supportedGenerationMethods?.includes("generateContent"))
		.map((model) => ({ ...model, id: (model.id ?? model.name ?? "").replace(/^models\//, "") }))
		.filter((model) => model.id && (providerId === "openrouter" ? model.supported_parameters?.includes("tools") : !NON_CHAT_MODEL.test(model.id)))
		.sort((a, b) => createdAt(b) - createdAt(a))
		.map((model) => {
			const sibling = providerId === "openrouter" ? undefined : findClosestModel(catalog, model.id);
			const thinking = catalogLevels.get(model.id)
				?? (sibling ? getSupportedThinkingLevels(sibling) : undefined)
				?? (providerId === "openrouter" && model.supported_parameters
					? (model.supported_parameters.includes("reasoning") ? BASE_THINKING_LEVELS : ["off" as const])
					: undefined);
			return {
				id: model.id,
				free: providerId === "openrouter" && model.pricing?.prompt !== undefined && model.pricing?.completion !== undefined
					&& Object.values(model.pricing).every((price) => price.trim() !== "" && Number(price) === 0),
				...(thinking ? { thinking } : {}),
			};
		});
}
