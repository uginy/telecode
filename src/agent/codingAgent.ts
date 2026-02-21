import { Agent, type AgentEvent, type AgentMessage, type AgentTool } from '@mariozechner/pi-agent-core';
import { getModel, getModels, type Message, type Model } from '@mariozechner/pi-ai';

export interface AISCodeConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxSteps: number;
}

const PROVIDER_ALIAS: Record<string, string> = {
  moonshot: 'kimi-coding',
};

const FALLBACK_BASE_URL_BY_PROVIDER: Record<string, string> = {
  ollama: 'http://localhost:11434/v1',
};

function normalizeProvider(provider: string): string {
  const trimmed = provider.trim().toLowerCase();
  return PROVIDER_ALIAS[trimmed] ?? trimmed;
}

function applyBaseUrl(model: Model<any>, baseUrl?: string): Model<any> {
  const normalizedBaseUrl = baseUrl?.trim();
  if (!normalizedBaseUrl) {
    return model;
  }

  return {
    ...model,
    baseUrl: normalizedBaseUrl,
  };
}

function resolveModel(config: AISCodeConfig): Model<any> {
  const provider = normalizeProvider(config.provider);
  const modelId = config.model.trim();

  try {
    const knownModel = getModel(provider as never, modelId as never) as Model<any>;
    return applyBaseUrl(knownModel, config.baseUrl);
  } catch {
    // fallback to template cloning for custom model ids
  }

  try {
    const providerModels = getModels(provider as never) as Model<any>[];
    const template = providerModels[0];
    if (template) {
      return {
        ...template,
        id: modelId,
        name: modelId,
        baseUrl: config.baseUrl?.trim() || template.baseUrl,
      };
    }
  } catch {
    // provider might not exist in built-in list (e.g. ollama)
  }

  return {
    id: modelId,
    name: modelId,
    api: 'openai-completions',
    provider,
    baseUrl: config.baseUrl?.trim() || FALLBACK_BASE_URL_BY_PROVIDER[provider] || 'http://localhost:11434/v1',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_384,
  } satisfies Model<'openai-completions'>;
}

function toLlmMessages(messages: AgentMessage[]): Message[] {
  return messages.filter(isLlmMessage) as Message[];
}

function isLlmMessage(message: AgentMessage): boolean {
  const role = (message as { role?: string }).role;
  return role === 'user' || role === 'assistant' || role === 'toolResult';
}

function buildSystemPrompt(maxSteps: number): string {
  return [
    'You are AIS Code, an autonomous coding agent inside VS Code.',
    'Prefer workspace tools over speculation. Keep changes minimal and high quality.',
    'When editing files, avoid unnecessary rewrites and preserve existing style.',
    `Do not exceed ${maxSteps} tool-assisted reasoning steps for a single task.`,
  ].join(' ');
}

export class CodingAgent {
  private readonly agent: Agent;

  constructor(config: AISCodeConfig, tools: AgentTool[] = []) {
    this.agent = new Agent({
      initialState: {
        systemPrompt: buildSystemPrompt(config.maxSteps),
        model: resolveModel(config),
        tools,
        messages: [],
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

  async prompt(message: string): Promise<void> {
    const normalized = message.trim();
    if (normalized.length === 0) {
      return;
    }

    await this.agent.prompt(normalized);
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
