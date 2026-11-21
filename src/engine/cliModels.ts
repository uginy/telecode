import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import type { DiscoveredModel } from '../agent/codingAgent';
import { CLI_BACKENDS } from './cliBackends';
import { cliNotFoundMessage, getLoginShellPath, resolveCliCommand } from './cliRuntime';

const KNOWN_LEVELS = new Set<string>(['low', 'medium', 'high', 'xhigh', 'max']);

/** Codex caches the models of the signed-in account, with the efforts each one accepts. */
export function parseCodexModelsCache(raw: string): DiscoveredModel[] {
  const parsed = JSON.parse(raw) as { models?: { slug?: string; visibility?: string; supported_reasoning_levels?: { effort?: string }[] }[] };
  return (parsed.models ?? [])
    .filter((model) => model.slug && model.visibility === 'list')
    .map((model) => ({
      id: model.slug!,
      free: false,
      thinking: ['off', ...(model.supported_reasoning_levels ?? [])
        .map((level) => level.effort ?? '')
        .filter((effort) => KNOWN_LEVELS.has(effort))] as ThinkingLevel[],
    }));
}

/** `agy models` prints one "id<TAB>label" line per model. */
export function parseAntigravityModels(stdout: string, levels: ThinkingLevel[]): DiscoveredModel[] {
  return stdout
    .split('\n')
    .map((line) => line.split('\t')[0].trim())
    .filter((id) => /^[\w.:-]+$/.test(id) && !id.startsWith('Fetching'))
    .map((id) => ({ id, free: false, thinking: levels }));
}

/** Models offered for a CLI provider; "default" keeps the CLI's own choice. */
export async function listCliModels(providerId: string): Promise<DiscoveredModel[]> {
  const backend = CLI_BACKENDS[providerId];
  const command = backend && resolveCliCommand(backend.command);
  if (!backend || !command) throw new Error(cliNotFoundMessage(backend?.command ?? providerId));
  // "off" stands for the CLI's own default effort: no flag is passed.
  const levels = ['off', ...backend.levels] as ThinkingLevel[];
  const defaults: DiscoveredModel = { id: 'default', free: false, thinking: levels };

  if (providerId === 'claude-code') {
    return [defaults, ...['opus', 'sonnet', 'haiku'].map((id) => ({ id, free: false, thinking: levels }))];
  }
  if (providerId === 'codex') {
    const raw = await readFile(join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'models_cache.json'), 'utf8').catch(() => '');
    return [defaults, ...(raw ? parseCodexModelsCache(raw) : [])];
  }
  const { stdout } = await promisify(execFile)(command, ['models'], {
    env: { ...process.env, PATH: getLoginShellPath() },
    timeout: 30_000,
  });
  return [defaults, ...parseAntigravityModels(stdout, levels)];
}
