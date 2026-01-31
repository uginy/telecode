export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResult {
  toolCallId: string;
  output: string;
  isError: boolean;
}

export interface EditProposal {
  id: string;
  filePath: string;
  description: string;
  timestamp: number;
}

export interface ToolApprovalRequest {
  id: string;
  toolCallId: string;
  toolName: string;
  title: string;
  description?: string;
  args: Record<string, unknown>;
  timestamp: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  statusKey?: string;
  toolCalls?: ToolCall[];
  toolResult?: ToolResult;
  toolResults?: Record<string, ToolResult>;
  approvalData?: EditProposal;
  isApprovalRequest?: boolean;
  toolApprovalData?: ToolApprovalRequest;
  isToolApprovalRequest?: boolean;
}
