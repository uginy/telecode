import type { AgentTool } from '@mariozechner/pi-agent-core';
import { NanoclawRuntime } from './nanoclawRuntime';
import { PiRuntime } from './piRuntime';
import type { AgentRuntime, RuntimeConfig } from './types';

export type RuntimeEnginePreference = 'auto' | 'nanoclaw' | 'pi';

function resolveEngine(preference: RuntimeEnginePreference, provider: string, model: string): 'nanoclaw' | 'pi' {
  if (preference === 'pi') {
    return 'pi';
  }

  if (preference === 'nanoclaw') {
    return 'nanoclaw';
  }

  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedModel = model.trim().toLowerCase();

  if (normalizedProvider === 'anthropic' || normalizedModel.includes('claude')) {
    return 'nanoclaw';
  }

  return 'pi';
}

export function createRuntime(
  preference: RuntimeEnginePreference,
  config: RuntimeConfig,
  tools: AgentTool[]
): { runtime: AgentRuntime; engine: 'nanoclaw' | 'pi'; fallbackReason?: string } {
  const engine = resolveEngine(preference, config.provider, config.model);

  if (engine === 'nanoclaw') {
    if (config.provider.trim().toLowerCase() !== 'anthropic' && !config.model.toLowerCase().includes('claude')) {
      const runtime = new PiRuntime(config, tools);
      return {
        runtime,
        engine: 'pi',
        fallbackReason: 'nanoclaw currently runs Claude-native flow, switched to pi runtime for selected provider/model',
      };
    }

    return {
      runtime: new NanoclawRuntime(config),
      engine: 'nanoclaw',
    };
  }

  return {
    runtime: new PiRuntime(config, tools),
    engine: 'pi',
  };
}
