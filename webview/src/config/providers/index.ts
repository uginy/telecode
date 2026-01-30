import { openrouter } from './openrouter';
import { openai } from './openai';
import { anthropic } from './anthropic';
import type { ProviderDefinition } from './types';

export const PROVIDERS: ProviderDefinition[] = [
  openrouter,
  openai,
  anthropic,
];

export const getProviderById = (id: string) => 
  PROVIDERS.find(p => p.id === id);

export * from './types';
