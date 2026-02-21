import { type AgentEvent, type AgentTool } from '@mariozechner/pi-agent-core';
import { type AISCodeConfig, CodingAgent, createAgent } from '../agent/codingAgent';
import type { AgentRuntime, RuntimeConfig, RuntimeEvent, RuntimeListener } from './types';

export class PiRuntime implements AgentRuntime {
  public readonly engine = 'pi' as const;

  private readonly agent: CodingAgent;
  private readonly listeners = new Set<RuntimeListener>();

  constructor(config: RuntimeConfig, tools: AgentTool[]) {
    const agentConfig: AISCodeConfig = {
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      maxSteps: config.maxSteps,
    };

    this.agent = createAgent(agentConfig, tools);
    this.agent.subscribe((event) => {
      this.forward(event);
    });
  }

  async prompt(message: string): Promise<void> {
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

  private emit(event: RuntimeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private forward(event: AgentEvent): void {
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      this.emit({ type: 'text_delta', delta: event.assistantMessageEvent.delta });
      return;
    }

    if (event.type === 'tool_execution_start') {
      this.emit({ type: 'tool_start', toolName: event.toolName });
      return;
    }

    if (event.type === 'tool_execution_end') {
      this.emit({ type: 'tool_end', toolName: event.toolName, isError: event.isError });
      return;
    }

    if (event.type === 'agent_end') {
      this.emit({ type: 'done' });
      return;
    }

    if (event.type === 'message_end') {
      const msg = event.message as { errorMessage?: string };
      if (typeof msg.errorMessage === 'string' && msg.errorMessage.length > 0) {
        this.emit({ type: 'error', message: msg.errorMessage });
      }
    }
  }
}
