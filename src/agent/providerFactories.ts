import type { Model } from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { minimaxProvider } from "@earendil-works/pi-ai/providers/minimax";
import { moonshotaiProvider } from "@earendil-works/pi-ai/providers/moonshotai";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { kimiCodingProvider } from "@earendil-works/pi-ai/providers/kimi-coding";
import { xaiProvider } from "@earendil-works/pi-ai/providers/xai";
import { mistralProvider } from "@earendil-works/pi-ai/providers/mistral";
import { groqProvider } from "@earendil-works/pi-ai/providers/groq";
import { cerebrasProvider } from "@earendil-works/pi-ai/providers/cerebras";
import { zaiProvider } from "@earendil-works/pi-ai/providers/zai";
import { fireworksProvider } from "@earendil-works/pi-ai/providers/fireworks";
import { togetherProvider } from "@earendil-works/pi-ai/providers/together";
import { PROVIDER_CATALOG } from "./providerCatalog";

/** pi-ai providers with a dedicated implementation; their bundled model lists may lag behind the APIs. */
export const PROVIDERS = {
	xai: xaiProvider,
	mistral: mistralProvider,
	groq: groqProvider,
	cerebras: cerebrasProvider,
	zai: zaiProvider,
	fireworks: fireworksProvider,
	together: togetherProvider,
	openai: openaiProvider,
	openrouter: openrouterProvider,
	anthropic: anthropicProvider,
	google: googleProvider,
	minimax: minimaxProvider,
	moonshotai: moonshotaiProvider,
	deepseek: deepseekProvider,
	"kimi-coding": kimiCodingProvider,
};

export function getProviderFactory(providerId: string): (() => { getModels(): readonly Model<any>[] }) | undefined {
	return (PROVIDERS as Record<string, (() => { getModels(): readonly Model<any>[] }) | undefined>)[providerId];
}

export const OPENAI_COMPAT_BASE_URL_BY_PROVIDER: Record<string, string> = {
	openai: "https://api.openai.com/v1",
	openrouter: "https://openrouter.ai/api/v1",
	moonshotai: "https://api.moonshot.ai/v1",
	deepseek: "https://api.deepseek.com/v1",
	...Object.fromEntries(PROVIDER_CATALOG.flatMap((option) => (option.baseUrl ? [[option.id, option.baseUrl]] : []))),
};

export const NON_OPENAI_COMPAT_PROVIDERS = new Set([
	"anthropic",
	"minimax",
	"amazon-bedrock",
	"google",
	"google-gemini-cli",
	"google-vertex",
	"openai-codex",
	"azure-openai-responses",
	"github-copilot",
	"kimi-coding",
]);

/**
 * Bundled model sharing the longest id prefix, so a model released after the bundled catalog
 * (e.g. claude-fable-5-2) inherits its family's API and reasoning settings (claude-fable-5-1).
 */
export function findClosestModel<T extends { id: string }>(models: readonly T[], id: string): T | undefined {
	let best: T | undefined;
	let bestLength = 0;
	for (const model of models) {
		let length = 0;
		while (length < model.id.length && length < id.length && model.id[length] === id[length]) length++;
		if (length > bestLength || (length === bestLength && best && model.id > best.id)) {
			best = model;
			bestLength = length;
		}
	}
	// Below this share of the id the match is a different family, not a sibling.
	return bestLength >= id.length * 0.6 ? best : undefined;
}
