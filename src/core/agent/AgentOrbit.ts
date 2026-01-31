import type { Message, ToolCall, ToolResult } from "../types";
import { ContextManager } from "../context/manager";
import type { ToolRegistry } from "../tools/registry";

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

        const toolCalls = this.detectToolCalls(fullContent);
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

  private detectToolCalls(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    
    // Improved Regexes: more flexible with spaces and attributes
    const blockToolRegex = /<(write_file|replace_in_file|read_file|list_files|run_command|search_files|codebase_search|get_problems)(?:\s+path\s*=\s*"([^"]+)")?\s*>([\s\S]*?)<\/\1>/g;
    const selfClosingRegex = /<(read_file|list_files|get_problems)\s+path\s*=\s*"([^"]+)"\s*\/>/g;

    // 1. Detect Block Tools
    let match: RegExpExecArray | null;
    while (true) {
      match = blockToolRegex.exec(content);
      if (match === null) break;

      const tagName = match[1];
      const path = match[2];
      const innerContent = match[3];
      
      const args: Record<string, string> = {};
      if (path) args.path = path;
      
      switch (tagName) {
        case 'write_file':
        case 'replace_in_file':
          args.content = innerContent;
          break;
        case 'run_command':
          args.command = innerContent;
          break;
        case 'search_files':
          args.query = innerContent;
          break;
        case 'codebase_search': {
          const trimmed = innerContent.trim();
          if (trimmed.startsWith('{')) {
            try {
              const parsed = JSON.parse(trimmed) as { query?: string; path?: string | null };
              if (parsed.query) {
                args.query = parsed.query;
              }
              if (parsed.path !== undefined) {
                args.path = parsed.path;
              }
            } catch {
              args.query = innerContent;
            }
          } else {
            args.query = innerContent;
          }
          break;
        }
        case 'get_problems':
        case 'read_file':
        case 'list_files': {
          const trimmed = innerContent.trim();
          if (!args.path && trimmed) {
            args.path = trimmed;
          }
          if (tagName === 'list_files' && !args.path) {
            args.path = '.';
          }
          break;
        }
      }

      toolCalls.push({
        id: crypto.randomUUID(),
        name: tagName,
        arguments: JSON.stringify(args)
      });
    }

    // 2. Detect Self-Closing Tools
    let sMatch: RegExpExecArray | null;
    while (true) {
        sMatch = selfClosingRegex.exec(content);
        if (sMatch === null) break;

        const tagName = sMatch[1];
        const path = sMatch[2];
        
        // Avoid duplicates if already caught by block regex
        if (!toolCalls.some(tc => tc.name === tagName && JSON.parse(tc.arguments).path === path)) {
            toolCalls.push({
                id: crypto.randomUUID(),
                name: tagName,
                arguments: JSON.stringify({ path })
            });
        }
    }

    // 3. Fallback for get_problems without path
    if (content.includes('<get_problems />') || content.includes('<get_problems/>')) {
         if (!toolCalls.some(tc => tc.name === 'get_problems')) {
             toolCalls.push({
                 id: crypto.randomUUID(),
                 name: 'get_problems',
                 arguments: JSON.stringify({})
             });
         }
    }

    return toolCalls;
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
