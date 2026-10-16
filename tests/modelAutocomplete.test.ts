import { describe, expect, it } from 'vitest';
import { filterModels } from '../src/webview/model-autocomplete';

describe('model autocomplete', () => {
  const models = ['openai/gpt-4o', 'anthropic/claude-sonnet-4', 'anthropic/claude-opus-4', 'google/gemini-2.5-pro']
    .map((id) => ({ id, free: false }));

  it('matches multiple words regardless of case and order', () => {
    expect(filterModels(models, ' SONNET  CLAUDE ', false)).toEqual([models[1]]);
    expect(filterModels(models, 'google pro', false)).toEqual([models[3]]);
  });

  it('ranks a matching ID prefix first', () => {
    const choices = ['other/openai-model', 'openai/gpt-4o'].map((id) => ({ id, free: false }));
    expect(filterModels(choices, 'openai', false)).toEqual([choices[1], choices[0]]);
  });

  it('keeps suggestions short and returns no match for a custom ID', () => {
    expect(filterModels(Array.from({ length: 30 }, (_, i) => ({ id: `provider/model-${i}`, free: false })), '', false)).toHaveLength(12);
    expect(filterModels(models, 'my-custom-model', false)).toEqual([]);
  });

  it('combines free-only filtering with the search query', () => {
    const choices = [{ id: 'provider/coder', free: true }, { id: 'provider/chat', free: true }, ...models];
    expect(filterModels(choices, '', true)).toEqual(choices.slice(0, 2));
    expect(filterModels(choices, 'coder', true)).toEqual([choices[0]]);
  });
});
