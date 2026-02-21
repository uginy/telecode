import type { AgentRuntime, RuntimeConfig, RuntimeEvent, RuntimeListener } from './types';
import { buildComposedSystemPrompt } from '../prompts/promptStack';

type QueryOptions = {
  model?: string;
  cwd?: string;
  includePartialMessages?: boolean;
  maxTurns?: number;
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk';
  allowDangerouslySkipPermissions?: boolean;
  tools?: string[] | { type: 'preset'; preset: 'claude_code' };
  disallowedTools?: string[];
  env?: Record<string, string | undefined>;
};

type SDKMessage = {
  type: string;
  subtype?: string;
  result?: string;
  is_error?: boolean;
  errors?: string[];
  event?: {
    type?: string;
    delta?: {
      type?: string;
      text?: string;
    };
  };
  tool_name?: string;
  tool_use_id?: string;
  preceding_tool_use_ids?: string[];
};

function normalizeToolName(name: string): string {
  const known = name.trim();
  return known.length > 0 ? known : 'tool';
}

function splitClaudeTools(allowedTools: string[]): { tools: string[] | { type: 'preset'; preset: 'claude_code' }; disallowedTools: string[] } {
  const normalized = new Set(allowedTools.map((name) => name.trim()).filter((name) => name.length > 0));

  if (normalized.size === 0) {
    return { tools: { type: 'preset', preset: 'claude_code' }, disallowedTools: [] };
  }

  const allKnownTools = ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'];
  const allowed = allKnownTools.filter((tool) => normalized.has(tool));
  const disallowed = allKnownTools.filter((tool) => !normalized.has(tool));

  return {
    tools: allowed,
    disallowedTools: disallowed,
  };
}

export class NanoclawRuntime implements AgentRuntime {
  public readonly engine = 'nanoclaw' as const;

  private readonly listeners = new Set<RuntimeListener>();
  private readonly config: RuntimeConfig;
  private isAborted = false;

  private activeQuery: { close: () => void } | null = null;
  private readonly activeTools = new Map<string, string>();

  constructor(config: RuntimeConfig) {
    this.config = config;
  }

  onEvent(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  abort(): void {
    this.isAborted = true;
    this.activeQuery?.close();
    this.emit({ type: 'status', message: 'nanoclaw query aborted' });
  }

  async prompt(message: string): Promise<void> {
    const userPrompt = message.trim();
    if (userPrompt.length === 0) {
      return;
    }

    this.isAborted = false;
    this.activeTools.clear();
    const promptBuild = buildComposedSystemPrompt({
      cwd: this.config.cwd,
      maxSteps: this.config.maxSteps,
      tools: this.config.allowedTools.map((name) => ({ name })),
    });
    this.emit({
      type: 'status',
      message: `prompt_stack source=${promptBuild.source} layers=${promptBuild.layerCount} signature=${promptBuild.signature}`,
    });
    if (promptBuild.missing.length > 0) {
      this.emit({ type: 'status', message: `prompt_stack_missing ${promptBuild.missing.join(',')}` });
    }
    const prompt = `${promptBuild.prompt}\n\n# User Task\n${userPrompt}`;

    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    const { tools, disallowedTools } = splitClaudeTools(this.config.allowedTools);

    const options: QueryOptions = {
      model: this.config.model,
      cwd: this.config.cwd,
      includePartialMessages: true,
      maxTurns: this.config.maxSteps,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      tools,
      disallowedTools,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: this.config.apiKey || process.env.ANTHROPIC_API_KEY,
      },
    };

    const query = sdk.query({ prompt, options });
    this.activeQuery = query as { close: () => void };

    try {
      for await (const rawMessage of query as AsyncIterable<SDKMessage>) {
        if (this.isAborted) {
          break;
        }

        this.handleMessage(rawMessage);
      }

      if (!this.isAborted) {
        this.emit({ type: 'done' });
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      this.emit({ type: 'error', message: messageText });
      throw error;
    } finally {
      for (const toolName of this.activeTools.values()) {
        this.emit({ type: 'tool_end', toolName, isError: false });
      }
      this.activeTools.clear();
      this.activeQuery = null;
    }
  }

  private handleMessage(message: SDKMessage): void {
    if (message.type === 'stream_event') {
      const delta = message.event?.delta;
      if (message.event?.type === 'content_block_delta' && delta?.type === 'text_delta' && delta.text) {
        this.emit({ type: 'text_delta', delta: delta.text });
      }
      return;
    }

    if (message.type === 'tool_progress' && typeof message.tool_name === 'string' && typeof message.tool_use_id === 'string') {
      const toolName = normalizeToolName(message.tool_name);
      if (!this.activeTools.has(message.tool_use_id)) {
        this.activeTools.set(message.tool_use_id, toolName);
        this.emit({ type: 'tool_start', toolName });
      }
      return;
    }

    if (message.type === 'tool_use_summary' && Array.isArray(message.preceding_tool_use_ids)) {
      for (const toolUseId of message.preceding_tool_use_ids) {
        const toolName = this.activeTools.get(toolUseId);
        if (toolName) {
          this.emit({ type: 'tool_end', toolName, isError: false });
          this.activeTools.delete(toolUseId);
        }
      }
      return;
    }

    if (message.type === 'result') {
      if (typeof message.result === 'string' && message.result.length > 0) {
        this.emit({ type: 'text_delta', delta: `${message.result}\n` });
      }

      if (message.is_error === true) {
        const errText = Array.isArray(message.errors) && message.errors.length > 0
          ? message.errors.join('\n')
          : 'nanoclaw run failed';
        this.emit({ type: 'error', message: errText });
      }
    }
  }

  private emit(event: RuntimeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
