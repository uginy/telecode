import type { AgentTool } from '@mariozechner/pi-agent-core';
import { PiRuntime } from './piRuntime';
import type { AgentRuntime, RuntimeConfig } from './types';

export function createRuntime(
  config: RuntimeConfig,
  tools: AgentTool[]
): { runtime: AgentRuntime; engine: 'pi' } {
  return {
    runtime: new PiRuntime(config, tools),
    engine: 'pi',
  };
}
