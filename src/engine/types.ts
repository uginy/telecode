export type RuntimeEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_start'; toolName: string; args?: unknown }
  | { type: 'tool_end'; toolName: string; isError: boolean; result?: unknown }
  | { type: 'status'; message: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export type RuntimeListener = (event: RuntimeEvent) => void;

export interface AgentRuntime {
  readonly engine: 'pi' | 'nanoclaw';
  prompt(message: string): Promise<void>;
  abort(): void;
  onEvent(listener: RuntimeListener): () => void;
}

export interface RuntimeConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxSteps: number;
  allowedTools: string[];
  cwd: string;
}
