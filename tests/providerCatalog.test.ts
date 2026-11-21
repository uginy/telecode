import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROVIDER_CATALOG, normalizeProvider, providerRequiresApiKey } from '../src/agent/providerCatalog';
import { pickThinkingLevel } from '../src/webview/provider-picker';

describe('provider catalog', () => {
  it('matches the provider enum VS Code shows in its settings editor', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const setting = pkg.contributes.configuration.properties['telecode.provider'];
    expect(setting.enum).toEqual(PROVIDER_CATALOG.map((option) => option.id));
    expect(setting.enumDescriptions).toEqual(PROVIDER_CATALOG.map((option) => option.label));
  });

  it('keeps old free-text ids working', () => {
    expect(normalizeProvider(' Moonshot ')).toBe('moonshotai');
    expect(normalizeProvider('kimi')).toBe('kimi-coding');
    expect(providerRequiresApiKey('openai')).toBe(true);
    expect(providerRequiresApiKey('ollama')).toBe(false);
    expect(providerRequiresApiKey('my-gateway')).toBe(false);
  });
});

describe('pickThinkingLevel', () => {
  it('keeps the wanted level or falls back to the strongest one below it', () => {
    expect(pickThinkingLevel(['off', 'low', 'high'], 'high')).toBe('high');
    expect(pickThinkingLevel(['off', 'low', 'medium', 'high'], 'max')).toBe('high');
    expect(pickThinkingLevel(['off', 'low', 'high'], 'medium')).toBe('low');
    expect(pickThinkingLevel(['off'], 'high')).toBe('off');
  });
});
