import { ToolCall, ToolResult } from "../types";

export interface Tool {
  name: string;
  description: string;
  execute(args: any): Promise<string>;
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      return {
        toolCallId: call.id,
        output: `Error: Tool '${call.name}' not found.`,
        isError: true
      };
    }

    try {
      const args = JSON.parse(call.arguments);
      const output = await tool.execute(args);
      return {
        toolCallId: call.id,
        output,
        isError: false
      };
    } catch (error: any) {
      return {
        toolCallId: call.id,
        output: `Error: ${error.message}`,
        isError: true
      };
    }
  }

  getToolDefinitions(): string {
    return Array.from(this.tools.values())
      .map(t => `<tool name="${t.name}">${t.description}</tool>`)
      .join('\n');
  }
}
