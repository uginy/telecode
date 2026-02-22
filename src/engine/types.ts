import type { AgentMessage } from '@mariozechner/pi-agent-core';

export type RuntimeEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_start'; toolName: string; args?: unknown }
  | { type: 'tool_end'; toolName: string; isError: boolean; result?: unknown }
  | { type: 'status'; message: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export type RuntimeListener = (event: RuntimeEvent) => void;

export interface AgentRuntime {
  readonly engine: 'pi';
  prompt(message: string): Promise<void>;
  abort(): void;
  onEvent(listener: RuntimeListener): () => void;
  getModelInfo?(): { id: string; provider: string; api: string; baseUrl: string };
  getPromptInfo?(): { source: 'stack' | 'fallback'; signature: string; layerCount: number; missing: string[] };
  getMessages?(): AgentMessage[];
}

export interface RuntimeConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxSteps: number;
  allowedTools: string[];
  cwd: string;
  initialMessages?: AgentMessage[];
}
