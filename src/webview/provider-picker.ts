/**
 * provider-picker.ts
 * Provider dropdown, provider-dependent fields, and the per-model reasoning list.
 */

import { PROVIDER_CATALOG, findProvider, normalizeProvider, type ProviderKind } from '../agent/providerCatalog';

export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

const GROUPS: { kind: ProviderKind; key: string; fallback: string }[] = [
  { kind: 'api', key: 'provider_group_api', fallback: 'API key' },
  { kind: 'local', key: 'provider_group_local', fallback: 'Local models' },
  { kind: 'custom', key: 'provider_group_custom', fallback: 'Custom server' },
];

function t(key: string, fallback: string): string {
  return (window as unknown as { __tcTranslations?: Record<string, string> }).__tcTranslations?.[key] || fallback;
}

export function renderProviderOptions(select: HTMLSelectElement, current: string): void {
  const selected = normalizeProvider(current);
  select.replaceChildren();
  // A free-text id saved by older versions stays selectable instead of silently switching providers.
  if (selected && !findProvider(selected)) select.append(new Option(selected, selected));
  for (const group of GROUPS) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = t(group.key, group.fallback);
    for (const option of PROVIDER_CATALOG.filter((item) => item.kind === group.kind)) {
      optgroup.append(new Option(option.label, option.id));
    }
    select.append(optgroup);
  }
  select.value = selected || 'openrouter';
}

/** Base URL only matters for local and custom endpoints, or when the user already overrides it. */
export function syncProviderFields(provider: string, baseUrl: string): void {
  const option = findProvider(provider);
  const needsBaseUrl = !option || option.kind !== 'api';
  document.getElementById('baseUrlField')?.classList.toggle('hidden', !needsBaseUrl && baseUrl.trim() === '');
  document.getElementById('apiKeyField')?.classList.toggle('hidden', option?.kind === 'local');
  const baseUrlInput = document.getElementById('baseUrl') as HTMLInputElement | null;
  if (baseUrlInput) baseUrlInput.placeholder = option?.baseUrl ?? 'https://api.example.com/v1';
}

/** The wanted level if the model has it, else the strongest supported level below it. */
export function pickThinkingLevel(levels: readonly string[], wanted: string): string {
  if (levels.includes(wanted)) return wanted;
  const limit = THINKING_LEVELS.indexOf(wanted as (typeof THINKING_LEVELS)[number]);
  const below = levels.filter((level) => THINKING_LEVELS.indexOf(level as (typeof THINKING_LEVELS)[number]) <= limit);
  return below.at(-1) ?? levels[0] ?? 'off';
}

/** `levels` is undefined when the endpoint does not report reasoning support: offer every level then. */
export function renderThinkingOptions(select: HTMLSelectElement, levels: readonly string[] | undefined, wanted: string): void {
  const available = levels && levels.length > 0 ? levels : THINKING_LEVELS;
  select.replaceChildren();
  if (available.length === 1 && available[0] === 'off') {
    select.append(new Option(t('thinking_unsupported', 'This model does not support reasoning'), 'off'));
    select.disabled = true;
    return;
  }
  select.disabled = false;
  for (const level of available) select.append(new Option(t(`thinking_${level}`, level), level));
  select.value = pickThinkingLevel(available, wanted);
}
