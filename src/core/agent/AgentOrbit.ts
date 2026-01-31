import type { Message, ToolCall, ToolResult } from "../types";
import { ContextManager } from "../context/manager";
import type { ToolRegistry } from "../tools/registry";

export interface AIProvider {
  complete(messages: Message[], options: { stream?: boolean }): Promise<AsyncIterable<string> | string>;
}

export class AgentOrbit {
  private context: ContextManager;
  private provider: AIProvider;
  private registry: ToolRegistry;
  private isRunning = false;

  constructor(provider: AIProvider, registry: ToolRegistry, maxTokens?: number) {
    this.provider = provider;
    this.registry = registry;
    this.context = new ContextManager(maxTokens);
  }

  updateSystemContext(contextString: string) {
    const systemPromptContent = `
You are AIS Code, an expert AI software engineer and pair programmer inside Visual Studio Code.
Your goal is to help the user write, debug, and refactor code efficiently.

CORE GUIDELINES:
1.  **Context Aware**: You have access to the user's workspace file structure (provided below). Use this to understand the project architecture.
2.  **Tool Usage**: You have tools to read files, write files, list directories, and run terminal commands. USE THEM. Do not guess file contents. Always read a file before modifying it unless you are creating a new one.
3.  **Concise & Accurate**: Provide direct answers. Avoid fluff. When writing code, write the full improved version or use clear diffs if user prefers.
4.  **Safety**: Do not delete files or run destructive commands without clear intent or confirmation.
5.  **Language**: Respond in the language the user speaks (Russian or English), defaulting to Russian if they write in Russian.

WORKSPACE CONTEXT:
${contextString}

When user asks "what is this project about?", analyze the file structure and any README/package.json you see to answer.
`.trim();

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
    onToolResult?: (result: ToolResult) => void
  ) {
    if (this.isRunning) return;
    this.isRunning = true;

    this.context.addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: userInput,
      timestamp: Date.now()
    });

    try {
      while (this.isRunning) {
        const messages = this.context.getMessages();
        const response = await this.provider.complete(messages, { stream: true });

        let fullContent = "";
        if (typeof response === 'string') {
          fullContent = response;
          onUpdate(fullContent);
        } else {
          for await (const chunk of response) {
            fullContent += chunk;
            onUpdate(chunk);
          }
        }

        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: fullContent,
          timestamp: Date.now()
        };

        this.context.addMessage(assistantMessage);

        const toolCalls = this.detectToolCalls(fullContent);
        if (toolCalls.length > 0) {
          assistantMessage.toolCalls = toolCalls;
          const results = await this.executeTools(toolCalls);
          
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
    }
  }

  private detectToolCalls(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    const writeRegex = /<write_file\s+path="([^"]+)">([\s\S]*?)<\/write_file>/g;
    const readRegex = /<read_file\s+path="([^"]+)"\s*\/>|<read_file\s+path="([^"]+)">[\s\S]*?<\/read_file>/g;
    const listRegex = /<list_files\s+path="([^"]+)"\s*\/>|<list_files\s+path="([^"]+)">[\s\S]*?<\/list_files>/g;
    const commandRegex = /<run_command>([\s\S]*?)<\/run_command>/g;

    let match: RegExpExecArray | null;
    
    match = writeRegex.exec(content);
    while (match !== null) {
      toolCalls.push({
        id: crypto.randomUUID(),
        name: 'write_file',
        arguments: JSON.stringify({ path: match[1], content: match[2] })
      });
      match = writeRegex.exec(content);
    }
    
    match = readRegex.exec(content);
    while (match !== null) {
      toolCalls.push({
        id: crypto.randomUUID(),
        name: 'read_file',
        arguments: JSON.stringify({ path: match[1] || match[2] })
      });
      match = readRegex.exec(content);
    }

    match = listRegex.exec(content);
    while (match !== null) {
      toolCalls.push({
        id: crypto.randomUUID(),
        name: 'list_files',
        arguments: JSON.stringify({ path: match[1] || match[2] })
      });
      match = listRegex.exec(content);
    }

    match = commandRegex.exec(content);
    while (match !== null) {
      toolCalls.push({
        id: crypto.randomUUID(),
        name: 'run_command',
        arguments: JSON.stringify({ command: match[1] })
      });
      match = commandRegex.exec(content);
    }

    return toolCalls;
  }

  private async executeTools(calls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const call of calls) {
      const result = await this.registry.execute(call);
      results.push(result);
    }
    return results;
  }

  stop() {
    this.isRunning = false;
  }
}
