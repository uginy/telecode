import { type AgentEvent, type AgentTool } from '@mariozechner/pi-agent-core';
import { type AISCodeConfig, CodingAgent, createAgent } from '../agent/codingAgent';
import type { AgentRuntime, RuntimeConfig, RuntimeEvent, RuntimeListener } from './types';

export class PiRuntime implements AgentRuntime {
  public readonly engine = 'pi' as const;

  private readonly agent: CodingAgent;
  private readonly listeners = new Set<RuntimeListener>();
  private readonly toolNames: string[];

  constructor(config: RuntimeConfig, tools: AgentTool[]) {
    const agentConfig: AISCodeConfig = {
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      maxSteps: config.maxSteps,
      cwd: config.cwd,
    };

    this.toolNames = tools.map((tool) => tool.name);
    this.agent = createAgent(agentConfig, tools);
    this.agent.subscribe((event) => {
      this.forward(event);
    });
  }

  async prompt(message: string): Promise<void> {
    const modelInfo = this.agent.getModelInfo();
    const promptInfo = this.agent.getPromptInfo();
    const toolsPreview = this.toolNames.slice(0, 12).join(',');
    const toolsSuffix = this.toolNames.length > 12 ? `,+${this.toolNames.length - 12}` : '';
    this.emit({
      type: 'status',
      message: `tools_available count=${this.toolNames.length} names=${toolsPreview}${toolsSuffix}`,
    });
    this.emit({
      type: 'status',
      message: `prompt_stack source=${promptInfo.source} layers=${promptInfo.layerCount} signature=${promptInfo.signature}`,
    });
    if (promptInfo.missing.length > 0) {
      this.emit({
        type: 'status',
        message: `prompt_stack_missing ${promptInfo.missing.join(',')}`,
      });
    }
    this.emit({
      type: 'status',
      message: `llm_config api=${modelInfo.api} provider=${modelInfo.provider} model=${modelInfo.id} baseUrl=${modelInfo.baseUrl}`,
    });
    await this.agent.prompt(message);
  }

  abort(): void {
    this.agent.abort();
  }

  onEvent(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getModelInfo(): { id: string; provider: string; api: string; baseUrl: string } {
    return this.agent.getModelInfo();
  }

  getPromptInfo(): { source: 'stack' | 'fallback'; signature: string; layerCount: number; missing: string[] } {
    return this.agent.getPromptInfo();
  }

  private emit(event: RuntimeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private forward(event: AgentEvent): void {
    if (event.type === 'agent_start') {
      this.emit({ type: 'status', message: 'agent_start' });
      return;
    }

    if (event.type === 'turn_start') {
      this.emit({ type: 'status', message: 'turn_start' });
      return;
    }

    if (event.type === 'turn_end') {
      this.emit({ type: 'status', message: 'turn_end' });
      return;
    }

    if (event.type === 'message_start') {
      this.emit({ type: 'status', message: 'message_start' });
      return;
    }

    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      this.emit({ type: 'text_delta', delta: event.assistantMessageEvent.delta });
      return;
    }

    if (event.type === 'message_update') {
      // Non-text message_update events are noisy and not actionable for users.
      return;
    }

    if (event.type === 'tool_execution_start') {
      this.emit({ type: 'status', message: `tool_execution_start:${event.toolName}` });
      this.emit({ type: 'tool_start', toolName: event.toolName, args: event.args });
      return;
    }

    if (event.type === 'tool_execution_update') {
      this.emit({ type: 'status', message: `tool_execution_update:${event.toolName}` });
      return;
    }

    if (event.type === 'tool_execution_end') {
      this.emit({ type: 'status', message: `tool_execution_end:${event.toolName}` });
      this.emit({ type: 'tool_end', toolName: event.toolName, isError: event.isError, result: event.result });
      return;
    }

    if (event.type === 'agent_end') {
      this.emit({ type: 'status', message: 'agent_end' });
      this.emit({ type: 'done' });
      return;
    }

    if (event.type === 'message_end') {
      this.emit({ type: 'status', message: 'message_end' });
      const msg = event.message as { errorMessage?: string };
      if (typeof msg.errorMessage === 'string' && msg.errorMessage.length > 0) {
        this.emit({ type: 'error', message: msg.errorMessage });
      }
      return;
    }

    this.emit({ type: 'status', message: `event:${(event as { type?: string }).type || 'unknown'}` });
  }
}
