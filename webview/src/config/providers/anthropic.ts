import { Sparkles } from 'lucide-react';
import type { ProviderDefinition } from './types';

export const anthropic: ProviderDefinition = {
  id: 'anthropic',
  label: 'Anthropic',
  description: 'Claude 3.5 Sonnet and Haiku official models',
  icon: Sparkles,
  apiKeyPlaceholder: 'sk-ant-...',
  apiKeyUrl: 'https://console.anthropic.com/settings/keys',
  models: [
    { 
      id: 'claude-3-5-sonnet-20240620', 
      label: 'Claude 3.5 Sonnet', 
      description: 'Industry-leading intelligence and speed', 
      isFree: false,
      contextLimit: 200000
    },
    { 
      id: 'claude-3-5-haiku-20241022', 
      label: 'Claude 3.5 Haiku', 
      description: 'Ultra-fast and cost-effective', 
      isFree: false,
      contextLimit: 200000
    }
  ]
};
