import type { Message, ToolCall, ToolResult } from "../types";
import { ContextManager } from "../context/manager";
import type { ToolRegistry } from "../tools/registry";
import { parseToolCalls } from "../tools/toolParsing";

import { CORE_SYSTEM_PROMPT } from '../prompts';

export interface AIProvider {
  complete(
    messages: Message[],
    options: {
      stream?: boolean;
      signal?: AbortSignal;
      overrides?: {
        modelId?: string;
        maxTokens?: number;
        temperature?: number;
      };
    }
  ): Promise<AsyncIterable<string> | string>;
}

export class AgentOrbit {
  private context: ContextManager;
  private provider: AIProvider;
  private registry: ToolRegistry;
  private isRunning = false;
  private abortController: AbortController | null = null;

  constructor(provider: AIProvider, registry: ToolRegistry, maxTokens?: number) {
    this.provider = provider;
    this.registry = registry;
    this.context = new ContextManager(maxTokens);
  }

  updateSystemContext(contextString: string, activeFileContext?: string) {
    const systemPromptContent = CORE_SYSTEM_PROMPT(contextString, activeFileContext);

    this.context.setSystemMessage({
      id: 'system-prompt',
      role: 'system',
      content: systemPromptContent,
      timestamp: Date.now()
    });
  }

  getUsage() {
    return this.context.getUsage();
  }

  getMessages() {
    return this.context.getMessages();
  }

  setHistory(messages: Message[]) {
    this.context.setMessages(messages);
  }

  async run(
    userInput: string, 
    onUpdate: (chunk: string) => void,
    onToolResult?: (result: ToolResult) => void,
    onStatus?: (status: string) => void,
    onToolCalls?: (calls: ToolCall[]) => void
  ) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.abortController = new AbortController();

    this.context.addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: userInput,
      timestamp: Date.now()
    });

    try {
      while (this.isRunning) {
        if (this.abortController?.signal.aborted) break;

        const messages = this.context.getMessages();
        const response = await this.provider.complete(messages, { 
            stream: true,
            signal: this.abortController?.signal 
        });

        let fullContent = "";
        let isAborted = false;

        if (typeof response === 'string') {
          fullContent = response;
          onUpdate(fullContent);
        } else {
             try {
                for await (const chunk of response) {
                    if (this.abortController?.signal.aborted) {
                        isAborted = true;
                        break;
                    }
                    fullContent += chunk;
                    onUpdate(chunk);
                }
             } catch (err: any) {
                 if (err.name === 'AbortError') {
                     isAborted = true;
                 } else {
                     throw err;
                 }
             }
        }

        if (isAborted || this.abortController?.signal.aborted) break;

        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: fullContent,
          timestamp: Date.now()
        };

        this.context.addMessage(assistantMessage);

        const toolCalls = parseToolCalls(fullContent);
        if (toolCalls.length > 0) {
          onToolCalls?.(toolCalls);
          onStatus?.('running_tools');
          assistantMessage.toolCalls = toolCalls;
          const results = await this.executeTools(toolCalls);
          if (this.abortController?.signal.aborted) break;
          
          for (const result of results) {
            if (onToolResult) onToolResult(result);
            this.context.addMessage({
              id: crypto.randomUUID(),
              role: 'tool',
              content: result.output,
              timestamp: Date.now(),
              toolResult: result
            });
          }
          continue;
        }

        break;
      }
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }

  private async executeTools(calls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const call of calls) {
      if (!call.timestamp) {
        call.timestamp = Date.now();
      }
      const result = await this.registry.execute(call);
      results.push(result);
    }
    return results;
  }

  stop() {
    this.isRunning = false;
    if (this.abortController) {
        this.abortController.abort();
    }
  }
}
