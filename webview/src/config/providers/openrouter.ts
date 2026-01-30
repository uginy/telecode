import { Globe } from 'lucide-react';
import type { ProviderDefinition } from './types';

export const openrouter: ProviderDefinition = {
  id: 'openrouter',
  label: 'OpenRouter',
  description: 'Unified API for 100+ open-source and frontier models',
  icon: Globe,
  apiKeyPlaceholder: 'sk-or-v1-...',
  apiKeyUrl: 'https://openrouter.ai/keys',
  models: [
    { 
      id: 'google/gemini-2.0-flash-exp:free', 
      label: 'Gemini 2.0 Flash Exp', 
      description: 'Fast, multimodal, frontier performance', 
      isFree: true,
      contextLimit: 1048576,
      maxOutput: 8192,
      inputPrice: 'Free',
      outputPrice: 'Free'
    },
    { 
      id: 'arcee-ai/trinity-large-preview:free', 
      label: 'Trinity Large Preview', 
      description: 'Arcee AI high-performance large model', 
      isFree: true,
      contextLimit: 131072,
      inputPrice: 'Free',
      outputPrice: 'Free'
    },
    { 
      id: 'anthracite-org/magnum-72b-v2:free', 
      label: 'Magnum 72B V2', 
      description: 'High-quality open weights model', 
      isFree: true,
      contextLimit: 32768,
      inputPrice: 'Free',
      outputPrice: 'Free'
    },
    { 
      id: 'meta-llama/llama-3.1-405b-instruct', 
      label: 'Llama 3.1 405B', 
      description: 'Meta\'s flagship dense model', 
      isFree: false,
      contextLimit: 131072
    },
    { 
      id: 'anthropic/claude-3.5-sonnet', 
      label: 'Claude 3.5 Sonnet', 
      description: 'Anthropic\'s most intelligent model', 
      isFree: false,
      contextLimit: 200000
    },
    { 
      id: 'deepseek/deepseek-chat', 
      label: 'DeepSeek V3', 
      description: 'High-performance Chinese LLM', 
      isFree: false,
      contextLimit: 65536
    },
  ]
};
