import { 
  stream, 
  complete, 
  Context, 
  Tool, 
  Message,
} from "@mariozechner/pi-ai";

const { getModel } = require("@mariozechner/pi-ai");

export interface AISCodeConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export class PiAIProvider {
  private model: any;
  private config: AISCodeConfig;

  constructor(config: AISCodeConfig) {
    this.config = config;
    
    const providerConfig: Record<string, any> = {};
    if (config.baseUrl) {
      providerConfig.baseUrl = config.baseUrl;
    }
    
    this.model = getModel(config.provider, config.model, {
      apiKey: config.apiKey,
      ...providerConfig
    });
  }

  async chat(messages: Message[], tools?: Tool[]): Promise<{ content: string; toolCalls?: any[] }> {
    const context: Context = {
      systemPrompt: "You are a helpful coding assistant.",
      messages,
      tools
    };

    const response = await complete(this.model, context);
    
    const lastMessage = response;
    const content = lastMessage.content?.[0]?.type === "text" 
      ? lastMessage.content[0].text 
      : "";
    
    const toolCalls = (lastMessage as any).toolCalls || [];
    
    return { content, toolCalls };
  }

  async *chatStream(messages: Message[], tools?: Tool[]): AsyncGenerator<string> {
    const context: Context = {
      systemPrompt: "You are a helpful coding assistant.",
      messages,
      tools
    };

    for await (const event of stream(this.model, context)) {
      if (event.type === "text_delta") {
        yield event.delta;
      }
    }
  }
}

export const SUPPORTED_PROVIDERS = [
  { id: "openai", name: "OpenAI", requiresKey: true },
  { id: "anthropic", name: "Anthropic", requiresKey: true },
  { id: "google", name: "Google Gemini", requiresKey: true },
  { id: "openrouter", name: "OpenRouter (free)", requiresKey: true },
  { id: "minimax", name: "MiniMax", requiresKey: true },
  { id: "moonshot", name: "Moonshot (Kimi)", requiresKey: true },
  { id: "ollama", name: "Ollama (local)", requiresKey: false },
] as const;

export type SupportedProvider = typeof SUPPORTED_PROVIDERS[number]["id"];

export function createProvider(config: AISCodeConfig): PiAIProvider {
  return new PiAIProvider(config);
}
