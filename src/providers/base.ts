/**
 * Base interfaces for AI providers
 */

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  toolResult?: string;
  context?: any[];
}

export interface Model {
  id: string;
  name: string;
  contextWindow: number;
  maxOutput: number;
  supportsVision: boolean;
  isFree?: boolean;
  pricing?: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (fullResponse: string) => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}

export interface CompletionParams {
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
}

export interface AIProvider {
  readonly name: string;
  readonly displayName: string;
  
  /**
   * Check if the provider is configured (has API key, etc.)
   */
  isConfigured(): boolean;

  /**
   * Get available models for this provider
   */
  getModels(): Model[];

  /**
   * Stream a completion response
   */
  complete(messages: Message[], callbacks: StreamCallbacks): Promise<UsageStats>;

  /**
   * Test the connection to the provider
   */
  testConnection(): Promise<boolean>;
}

/**
 * Base class with common functionality
 */
export abstract class BaseProvider implements AIProvider {
  abstract readonly name: string;
  abstract readonly displayName: string;

  abstract isConfigured(): boolean;
  abstract getModels(): Model[];
  abstract complete(messages: Message[], callbacks: StreamCallbacks): Promise<UsageStats>;

  async testConnection(): Promise<boolean> {
    try {
      const testCallbacks: StreamCallbacks = {
        onToken: () => {},
        onComplete: () => {},
        onError: () => {}
      };
      
      await this.complete(
        [{ role: 'user', content: 'Say "ok"' }],
        testCallbacks
      );
      return true;
    } catch {
      return false;
    }
  }

  protected buildSystemPrompt(): string {
    return `You are AIS Code, an AI coding assistant running inside VS Code. 
You help developers write, understand, and improve code.
Be concise, accurate, and helpful.
When providing code, use markdown code blocks with the appropriate language.
If you make mistakes, acknowledge them and correct yourself.

You can request tools using XML tags (one per response):
- <read_file>path</read_file>
- <list_files>path</list_files>
- <write_file path="path">content</write_file>
- <run_command>command</run_command>
Wait for "Tool Execution Result" before continuing, and never fabricate tool output.

When editing files, prefer unified diff patches over full-file rewrites. Use proper paths, do not invent new files, and avoid truncating content.`;
  }
}
