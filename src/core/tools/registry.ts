import { ToolCall, ToolResult } from "../types";

export interface Tool {
  name: string;
  description: string;
  execute(args: any): Promise<string>;
}

type ToolApprovalHandler = (call: ToolCall) => Promise<boolean>;
type ToolApprovalPredicate = (call: ToolCall) => boolean;

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private approveTool?: ToolApprovalHandler;
  private requiresApproval: ToolApprovalPredicate;

  constructor(options?: { approveTool?: ToolApprovalHandler; requiresApproval?: ToolApprovalPredicate }) {
    this.approveTool = options?.approveTool;
    const defaultApprovalSet = new Set([
      'read_file',
      'list_files',
      'search_files',
      'codebase_search',
      'run_command',
      'get_problems'
    ]);
    this.requiresApproval = options?.requiresApproval || ((call) => defaultApprovalSet.has(call.name));
  }

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
      if (this.approveTool && this.requiresApproval(call)) {
        const approved = await this.approveTool(call);
        if (!approved) {
          return {
            toolCallId: call.id,
            output: `Tool '${call.name}' execution denied by user.`,
            isError: true
          };
        }
      }

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
