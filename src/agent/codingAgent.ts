import { Agent, type AgentEvent, type AgentMessage, type AgentTool } from '@mariozechner/pi-agent-core';
import { getModel, getModels, type Message, type Model, type ImageContent } from '@mariozechner/pi-ai';
import { buildComposedSystemPrompt } from '../prompts/promptStack';

export interface AISCodeConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxSteps: number;
  cwd?: string;
  initialMessages?: AgentMessage[];
  responseStyle?: 'concise' | 'normal' | 'detailed';
  language?: 'ru' | 'en';
}

export interface AgentPromptInfo {
  source: 'stack' | 'fallback';
  signature: string;
  layerCount: number;
  missing: string[];
}

const PROVIDER_ALIAS: Record<string, string> = {
  kimi: 'kimi-coding',
};

const OPENAI_COMPAT_BASE_URL_BY_PROVIDER: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  moonshot: 'https://api.moonshot.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  ollama: 'http://localhost:11434/v1',
};

const NON_OPENAI_COMPAT_PROVIDERS = new Set([
  'anthropic',
  'amazon-bedrock',
  'google',
  'google-gemini-cli',
  'google-vertex',
  'openai-codex',
  'azure-openai-responses',
  'github-copilot',
  'kimi-coding',
]);

function normalizeProvider(provider: string): string {
  const trimmed = provider.trim().toLowerCase();
  return PROVIDER_ALIAS[trimmed] ?? trimmed;
}

function isModelLike(value: unknown): value is Model<any> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const model = value as Record<string, unknown>;
  return (
    typeof model.id === 'string' &&
    typeof model.api === 'string' &&
    typeof model.provider === 'string' &&
    typeof model.baseUrl === 'string'
  );
}

function applyBaseUrl(model: Model<any>, baseUrl?: string): Model<any> {
  const normalizedBaseUrl = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  if (!normalizedBaseUrl) {
    return model;
  }

  return {
    ...model,
    baseUrl: normalizedBaseUrl,
  };
}

function shouldPreferOpenAiCompatibleModel(provider: string, baseUrl?: string): boolean {
  if (NON_OPENAI_COMPAT_PROVIDERS.has(provider)) {
    return false;
  }

  if ((baseUrl || '').trim().length > 0) {
    return true;
  }

  return provider in OPENAI_COMPAT_BASE_URL_BY_PROVIDER;
}

function buildOpenAiCompatibleModel(provider: string, modelId: string, baseUrl?: string): Model<'openai-completions'> {
  const normalizedBaseUrl = (baseUrl || '').trim();

  return {
    id: modelId,
    name: modelId,
    api: 'openai-completions',
    provider,
    baseUrl:
      normalizedBaseUrl ||
      OPENAI_COMPAT_BASE_URL_BY_PROVIDER[provider] ||
      OPENAI_COMPAT_BASE_URL_BY_PROVIDER.openai,
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_384,
  } satisfies Model<'openai-completions'>;
}

function resolveModel(config: AISCodeConfig): Model<any> {
  const provider = normalizeProvider(config.provider);
  const modelId = config.model.trim() || 'gpt-4o-mini';
  const baseUrl = (config.baseUrl || '').trim();

  let knownModelCandidate: unknown;
  try {
    knownModelCandidate = getModel(provider as never, modelId as never) as unknown;
  } catch {
    knownModelCandidate = undefined;
  }
  if (isModelLike(knownModelCandidate)) {
    return applyBaseUrl(knownModelCandidate, baseUrl);
  }

  if (shouldPreferOpenAiCompatibleModel(provider, baseUrl)) {
    return buildOpenAiCompatibleModel(provider, modelId, baseUrl);
  }

  try {
    const providerModels = getModels(provider as never) as unknown[];
    const template = providerModels.find((candidate) => isModelLike(candidate));
    if (template) {
      const typedTemplate = template as Model<any>;
      const resolvedInput = typedTemplate.input.includes('image')
        ? typedTemplate.input
        : [...typedTemplate.input, 'image'];
      
      const resolved: Model<any> = {
        ...typedTemplate,
        id: modelId,
        name: modelId,
        input: resolvedInput as any,
      };
      return applyBaseUrl(resolved, baseUrl);
    }
  } catch {
    // provider might not exist in built-in list (e.g. ollama)
  }

  return buildOpenAiCompatibleModel(provider, modelId, baseUrl);
}

function toLlmMessages(messages: AgentMessage[]): Message[] {
  return messages.filter(isLlmMessage) as Message[];
}

function isLlmMessage(message: AgentMessage): boolean {
  const role = (message as { role?: string }).role;
  return role === 'user' || role === 'assistant' || role === 'toolResult';
}

export class CodingAgent {
  private readonly agent: Agent;
  private readonly promptInfo: AgentPromptInfo;

  constructor(config: AISCodeConfig, tools: AgentTool[] = []) {
    const promptBuild = buildComposedSystemPrompt({
      cwd: config.cwd,
      maxSteps: config.maxSteps,
      tools,
      responseStyle: config.responseStyle,
      language: config.language,
    });
    this.promptInfo = {
      source: promptBuild.source,
      signature: promptBuild.signature,
      layerCount: promptBuild.layerCount,
      missing: [...promptBuild.missing],
    };

    this.agent = new Agent({
      initialState: {
        systemPrompt: promptBuild.prompt,
        model: resolveModel(config),
        tools,
        messages: config.initialMessages || [],
      },
      convertToLlm: toLlmMessages,
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

    await this.agent.prompt(normalized, images);
  }

  abort(): void {
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

  getModelInfo(): { id: string; provider: string; api: string; baseUrl: string } {
    const model = this.agent.state.model as Partial<Model<any>> | undefined;
    return {
      id: typeof model?.id === 'string' ? model.id : '(unknown)',
      provider: typeof model?.provider === 'string' ? model.provider : '(unknown)',
      api: typeof model?.api === 'string' ? model.api : '(unknown)',
      baseUrl: typeof model?.baseUrl === 'string' ? model.baseUrl : '(none)',
    };
  }

  getPromptInfo(): AgentPromptInfo {
    return this.promptInfo;
  }
}

export function createAgent(config: AISCodeConfig, tools: AgentTool[] = []): CodingAgent {
  return new CodingAgent(config, tools);
}

export function getLastAssistantText(messages: AgentMessage[]): string {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || (lastMessage as { role?: string }).role !== 'assistant') {
    return '';
  }

  const content = (lastMessage as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter(
      (block): block is { type: 'text'; text: string } =>
        typeof block === 'object' &&
        block !== null &&
        (block as { type?: string }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string'
    )
    .map((block) => block.text)
    .join('');
}
