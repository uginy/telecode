import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import { getSupportedThinkingLevels, type Model } from '@earendil-works/pi-ai';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import type { DiscoveredModel } from '../agent/codingAgent';
import { findClosestModel } from '../agent/providerFactories';
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

const CLAUDE_FAMILIES = ['fable', 'opus', 'sonnet', 'haiku'];

/** Family rank, then version, newest first: claude-fable-5-2 before claude-fable-5-1 before claude-opus-5-5. */
function compareClaudeModels(a: string, b: string): number {
  const rank = (id: string) => {
    const index = CLAUDE_FAMILIES.findIndex((family) => id.includes(`-${family}`));
    return index < 0 ? CLAUDE_FAMILIES.length : index;
  };
  return rank(a) - rank(b) || b.localeCompare(a, undefined, { numeric: true });
}

/**
 * Claude Code has no command that lists models. Its config (~/.claude.json) caches the models
 * of the signed-in account: prices per model id and extra picker options such as the 1M-context
 * Fable. Aliases (fable, opus, sonnet, haiku) let the CLI pick the latest model of a family.
 * Reasoning levels come from the closest model in pi-ai's Anthropic catalog.
 */
export function listClaudeCodeModels(rawConfig: string, catalog: readonly Model<any>[]): DiscoveredModel[] {
  let config: { additionalModelCostsCache?: Record<string, unknown>; additionalModelOptionsCache?: { value?: string }[] } = {};
  try {
    config = rawConfig ? JSON.parse(rawConfig) : {};
  } catch {
    // Unreadable config: fall back to the bundled catalog below.
  }
  const cached = [
    ...Object.keys(config.additionalModelCostsCache ?? {}),
    ...(config.additionalModelOptionsCache ?? []).map((option) => option.value ?? ''),
  ].filter((id) => /^claude-[\w.[\]-]+$/.test(id));
  const ids = [...new Set(cached.length > 0 ? cached : catalog.map((model) => model.id))].sort(compareClaudeModels);

  const levelsFor = (id: string): ThinkingLevel[] => {
    // "claude-fable-5-1[1m]" is the 1M-context variant of claude-fable-5-1.
    const model = findClosestModel(catalog, id.replace(/\[.*\]$/, ''));
    const supported = model ? getSupportedThinkingLevels(model) : [...KNOWN_LEVELS];
    // "off" is the CLI default (no --effort); the CLI has no "minimal".
    return ['off', ...supported.filter((level) => KNOWN_LEVELS.has(level))] as ThinkingLevel[];
  };
  const latestOf = (family: string) => ids.find((id) => id.startsWith(`claude-${family}-`) && !id.includes('['));
  const aliases = CLAUDE_FAMILIES.filter(latestOf).map((family) => ({ id: family, free: false, thinking: levelsFor(latestOf(family)!) }));
  return [...aliases, ...ids.map((id) => ({ id, free: false, thinking: levelsFor(id) }))];
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
    const raw = await readFile(join(process.env.CLAUDE_CONFIG_DIR || homedir(), '.claude.json'), 'utf8').catch(() => '');
    return [defaults, ...listClaudeCodeModels(raw, anthropicProvider().getModels())];
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
