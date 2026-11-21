import type { AgentTool } from '@earendil-works/pi-agent-core';
import { normalizeProvider } from '../agent/providerCatalog';
import { CLI_BACKENDS } from './cliBackends';
import { CliRuntime } from './cliRuntime';
import { PiRuntime } from './piRuntime';
import type { AgentRuntime, RuntimeConfig } from './types';

export function createRuntime(
  config: RuntimeConfig,
  tools: AgentTool[]
): { runtime: AgentRuntime; engine: AgentRuntime['engine'] } {
  const backend = CLI_BACKENDS[normalizeProvider(config.provider)];
  if (backend) return { runtime: new CliRuntime(config, backend), engine: 'cli' };
  return {
    runtime: new PiRuntime(config, tools),
    engine: 'pi',
  };
}
