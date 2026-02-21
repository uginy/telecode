import { Agent, AgentTool, AgentMessage, AgentEvent } from "@mariozechner/pi-agent-core";
import { getModel, Message, TextContent } from "@mariozechner/pi-ai";

export interface AISCodeConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export class CodingAgent {
  private agent: Agent;

  constructor(config: AISCodeConfig, tools: AgentTool<any>[] = []) {
    const providerConfig: Record<string, any> = {};
    if (config.baseUrl) {
      providerConfig.baseUrl = config.baseUrl;
    }

    const model = getModel(config.provider, config.model);

    this.agent = new Agent({
      initialState: {
        systemPrompt: `You are an autonomous coding assistant. You can read/write files, run commands, search code.`,
        model,
        tools,
        messages: [],
      },
      convertToLlm: (messages: AgentMessage[]): Message[] => {
        return messages
          .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "toolResult")
          .map((m) => {
            if (m.role === "toolResult") {
              const content: TextContent = {
                type: "text",
                text: (m as any).content || "",
              };
              return { role: m.role, content: [content], toolCallId: m.toolCallId };
            }
            return { role: m.role as any, content: (m as any).content };
          }) as Message[];
      },
    });
  }

  subscribe(fn: (event: AgentEvent) => void): () => void {
    return this.agent.subscribe(fn);
  }

  async prompt(message: string): Promise<void> {
    await this.agent.prompt(message);
  }

  async continue(): Promise<void> {
    await this.agent.continue();
  }

  getAgent(): Agent {
    return this.agent;
  }
}

export function createAgent(config: AISCodeConfig, tools?: AgentTool<any>[]): CodingAgent {
  return new CodingAgent(config, tools);
}
