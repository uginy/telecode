import { Cpu } from 'lucide-react';
import type { ProviderDefinition } from './types';

export const openai: ProviderDefinition = {
  id: 'openai',
  label: 'OpenAI',
  description: 'Official API for ChatGPT models',
  icon: Cpu,
  apiKeyPlaceholder: 'sk-...',
  apiKeyUrl: 'https://platform.openai.com/api-keys',
  models: [
    { 
      id: 'gpt-4o', 
      label: 'GPT-4o', 
      description: 'Most capable model for complex reasoning', 
      isFree: false,
      contextLimit: 128000
    },
    { 
      id: 'gtp-4o-mini', 
      label: 'GPT-4o mini', 
      description: 'Affordable, fast model for lightweight tasks', 
      isFree: false,
      contextLimit: 128000
    }
  ]
};
