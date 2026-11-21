import {
	Agent,
	type AgentEvent,
	type AgentMessage,
	type AgentTool,
	type ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import {
	clampThinkingLevel,
	createModels,
	createProvider,
	type Model,
	type ImageContent,
	type Models,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { buildComposedSystemPrompt } from "../prompts/promptStack";
import { compactContext } from "./contextCompaction";
import { normalizeProvider, providerRequiresApiKey } from "./providerCatalog";
import { NON_OPENAI_COMPAT_PROVIDERS, OPENAI_COMPAT_BASE_URL_BY_PROVIDER, PROVIDERS, findClosestModel } from "./providerFactories";
import { discoverModels } from "./modelDiscovery";

export { normalizeProvider, OPENAI_COMPAT_BASE_URL_BY_PROVIDER };

export interface TelecodeConfig {
	provider: string;
	model: string;
	apiKey: string;
	baseUrl?: string;
	maxSteps: number;
	autoApprove?: boolean;
	cwd?: string;
	initialMessages?: AgentMessage[];
	responseStyle?: "concise" | "normal" | "detailed";
	language?: "ru" | "en" | "auto";
	allowOutOfWorkspace?: boolean;
	thinkingLevel?: ThinkingLevel;
}

export interface AgentPromptInfo {
	source: "stack" | "fallback";
	signature: string;
	layerCount: number;
	missing: string[];
}

export interface DiscoveredModel {
	id: string;
	free: boolean;
	/** Reasoning levels the model accepts; absent when the endpoint does not say. */
	thinking?: ThinkingLevel[];
}


const DEFAULT_CONTEXT_WINDOW = 128_000;

function applyBaseUrl(model: Model<any>, baseUrl?: string): Model<any> {
	const normalizedBaseUrl = typeof baseUrl === "string" ? baseUrl.trim() : "";
	if (!normalizedBaseUrl) {
		return model;
	}

	return {
		...model,
		baseUrl: normalizedBaseUrl,
	};
}

export function shouldPreferOpenAiCompatibleModel(
	provider: string,
	baseUrl?: string,
): boolean {
	if (NON_OPENAI_COMPAT_PROVIDERS.has(provider)) {
		return false;
	}

	if ((baseUrl || "").trim().length > 0) {
		return true;
	}

	return provider in OPENAI_COMPAT_BASE_URL_BY_PROVIDER;
}

function buildOpenAiCompatibleModel(
	provider: string,
	modelId: string,
	baseUrl?: string,
	reasoning = false,
): Model<"openai-completions"> {
	const normalizedBaseUrl = (baseUrl || "").trim();

	return {
		id: modelId,
		name: modelId,
		api: "openai-completions",
		provider,
		baseUrl:
			normalizedBaseUrl ||
			OPENAI_COMPAT_BASE_URL_BY_PROVIDER[provider] ||
			OPENAI_COMPAT_BASE_URL_BY_PROVIDER.openai,
		// Unknown models only get reasoning params when the user opted into thinking.
		reasoning,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: DEFAULT_CONTEXT_WINDOW,
		maxTokens: 16_384,
		compat: {
			requiresToolResultName:
				provider === "moonshotai" ||
				provider === "mistral" ||
				provider === "deepseek",
			supportsStrictMode: false,
			supportsStore: false,
			supportsDeveloperRole: false,
			requiresAssistantAfterToolResult: true, // Some proxies need a placeholder assistant message after tool results
			supportsUsageInStreaming: false, // Some OpenAI-compatible wrappers fail on stream_options
		},
	} satisfies Model<"openai-completions">;
}

type ModelConfig = Pick<TelecodeConfig, "provider" | "model" | "apiKey" | "baseUrl" | "thinkingLevel">;

function resolveModel(config: ModelConfig, models: Models): Model<any> {
	const provider = normalizeProvider(config.provider);
	const modelId = config.model.trim();
	const baseUrl = (config.baseUrl || "").trim();
	if (!modelId) throw new Error("Select a model in TeleCode settings before starting the agent.");

	const knownModel = models.getModel(provider, modelId);
	if (knownModel) return applyBaseUrl(knownModel, baseUrl);
	// A model newer than the bundled catalog takes its family's API and reasoning settings.
	// OpenRouter and custom endpoints serve many vendors, so a name match there means little.
	const sibling = provider === "openrouter" || baseUrl ? undefined : findClosestModel(models.getModels(provider), modelId);
	if (sibling) return { ...sibling, id: modelId, name: modelId };
	if (shouldPreferOpenAiCompatibleModel(provider, baseUrl)) {
		return buildOpenAiCompatibleModel(provider, modelId, baseUrl, (config.thinkingLevel ?? "off") !== "off");
	}
	const template = models.getModels(provider)[0];
	if (!template) throw new Error(`Unknown provider "${config.provider}". Configure a supported provider or a custom OpenAI-compatible base URL.`);
	return applyBaseUrl({ ...template, id: modelId, name: modelId }, baseUrl);
}

function createModelRuntime(config: ModelConfig) {
	const models = createModels();
	const providerId = normalizeProvider(config.provider);
	const factory = PROVIDERS[providerId as keyof typeof PROVIDERS];
	if (factory) models.setProvider(factory());
	const model = resolveModel(config, models);
	if (!factory) {
		models.setProvider(createProvider({
			id: providerId,
			models: [model],
			// Local servers ignore the key, but the OpenAI client still needs a non-empty one.
			auth: { apiKey: { name: providerId, resolve: async () => ({ auth: { apiKey: config.apiKey.trim() || (providerRequiresApiKey(providerId) ? undefined : "local") } }) } },
			api: openAICompletionsApi(),
		}));
	}
	return { models, model };
}

export class CodingAgent {
	private readonly agent: Agent;
	private readonly promptInfo: AgentPromptInfo;
	private steps = 0;
	private runError: string | undefined;

	constructor(config: TelecodeConfig, tools: AgentTool[] = []) {
		if (config.autoApprove === false) {
			throw new Error("Interactive tool approvals are not supported. Enable telecode.autoApprove to run the agent; use the strict profile for read-only tasks.");
		}
		const promptBuild = buildComposedSystemPrompt({
			cwd: config.cwd,
			maxSteps: config.maxSteps,
			tools,
			responseStyle: config.responseStyle,
			language: config.language,
			allowOutOfWorkspace: config.allowOutOfWorkspace,
		});
		this.promptInfo = {
			source: promptBuild.source,
			signature: promptBuild.signature,
			layerCount: promptBuild.layerCount,
			missing: [...promptBuild.missing],
		};

		const { models, model: resolvedModelObj } = createModelRuntime(config);

		this.agent = new Agent({
			initialState: {
				systemPrompt: promptBuild.prompt,
				model: resolvedModelObj,
				thinkingLevel: clampThinkingLevel(resolvedModelObj, config.thinkingLevel ?? "off"),
				tools,
				messages: (config.initialMessages || []).filter((message) => message.role !== "system"),
			},
			streamFn: models.streamSimple.bind(models),
			transformContext: async (messages) =>
				compactContext(messages, this.agent.state.model.contextWindow || DEFAULT_CONTEXT_WINDOW),
			toolExecution: "sequential",
			beforeToolCall: async (_context, signal) => {
				if (signal?.aborted) return { block: true, reason: this.runError || "Task interrupted.", terminate: true };
				if (this.steps >= config.maxSteps) {
					this.runError = `Task stopped after reaching the limit of ${config.maxSteps} tool calls.`;
					this.agent.abort();
					return { block: true, reason: this.runError, terminate: true };
				}
				this.steps++;
				return undefined;
			},
			getApiKey: () => {
				const apiKey = config.apiKey.trim();
				return apiKey.length > 0 ? apiKey : undefined;
			},
		});
	}

	subscribe(fn: (event: AgentEvent) => void): () => void {
		return this.agent.subscribe(fn);
	}

	async prompt(message: string, images?: ImageContent[]): Promise<void> {
		const normalized = message.trim();
		if (normalized.length === 0) {
			return;
		}

		this.steps = 0;
		this.runError = undefined;
		await this.agent.prompt(normalized, images);
		this.throwIfRunFailed();
		// A steering message that arrived after the final turn is handled now instead of leaking into the next task.
		while (this.agent.hasQueuedMessages()) {
			await this.agent.continue();
			this.throwIfRunFailed();
		}
	}

	/** Inject a user message into the running task; it is read after the current tool calls finish. */
	steer(message: string): void {
		this.agent.steer({ role: "user", content: message, timestamp: Date.now() });
	}

	private throwIfRunFailed(): void {
		const lastMessage = this.agent.state.messages.at(-1);
		if (this.runError || this.agent.state.errorMessage) throw new Error(this.runError || this.agent.state.errorMessage);
		if (lastMessage?.role === "assistant" &&
			(lastMessage.stopReason === "error" || lastMessage.stopReason === "aborted")) {
			throw new Error(lastMessage.errorMessage || "Task interrupted.");
		}
	}

	abort(): void {
		this.agent.clearAllQueues();
		this.agent.abort();
	}

	async waitForIdle(): Promise<void> {
		await this.agent.waitForIdle();
	}

	getMessages(): AgentMessage[] {
		return this.agent.state.messages;
	}

	getAgent(): Agent {
		return this.agent;
	}

	getModelInfo(): {
		id: string;
		provider: string;
		api: string;
		baseUrl: string;
	} {
		const model = this.agent.state.model as Partial<Model<any>> | undefined;
		return {
			id: typeof model?.id === "string" ? model.id : "(unknown)",
			provider:
				typeof model?.provider === "string" ? model.provider : "(unknown)",
			api: typeof model?.api === "string" ? model.api : "(unknown)",
			baseUrl: typeof model?.baseUrl === "string" ? model.baseUrl : "(none)",
		};
	}

	getPromptInfo(): AgentPromptInfo {
		return this.promptInfo;
	}

	static async testConnection(config: ModelConfig): Promise<string> {
		if (providerRequiresApiKey(config.provider) && !config.apiKey.trim()) {
			throw new Error("Enter an API key before testing the connection.");
		}
		const { models, model } = createModelRuntime(config);
		const result = await models.completeSimple(model, {
			messages: [{ role: "user", content: "Reply with OK.", timestamp: Date.now() }],
		}, { apiKey: config.apiKey.trim() || undefined, maxTokens: 32, signal: AbortSignal.timeout(20_000) });
		if (result.stopReason === "error" || result.stopReason === "aborted") {
			throw new Error(result.errorMessage || "Connection test failed.");
		}
		return `${config.provider}/${config.model}`;
	}

	static async fetchModelsFromApi(
		provider: string,
		baseUrl: string,
		apiKey: string,
	): Promise<DiscoveredModel[]> {
		return discoverModels(provider, baseUrl, apiKey);
	}
}

export function createAgent(
	config: TelecodeConfig,
	tools: AgentTool[] = [],
): CodingAgent {
	return new CodingAgent(config, tools);
}

export function getLastAssistantText(messages: AgentMessage[]): string {
	const lastMessage = messages[messages.length - 1];
	if (!lastMessage || (lastMessage as { role?: string }).role !== "assistant") {
		return "";
	}

	const content = (lastMessage as { content?: unknown }).content;
	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.filter(
			(block): block is { type: "text"; text: string } =>
				typeof block === "object" &&
				block !== null &&
				(block as { type?: string }).type === "text" &&
				typeof (block as { text?: unknown }).text === "string",
		)
		.map((block) => block.text)
		.join("");
}
