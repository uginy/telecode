import { Server } from 'lucide-react';
import type { ProviderDefinition } from './types';

export const openaiCompatible: ProviderDefinition = {
  id: 'openai-compatible',
  label: 'OpenAI Compatible',
  description: 'Local or self-hosted OpenAI-style APIs (Ollama, LM Studio)',
  icon: Server,
  apiKeyPlaceholder: 'optional',
  apiKeyUrl: 'https://ollama.com',
  models: [
    { 
      id: 'llama3.2', 
      label: 'Llama 3.2', 
      description: 'General purpose local model', 
      isFree: true,
      contextLimit: 128000
    },
    { 
      id: 'qwen2.5-coder', 
      label: 'Qwen 2.5 Coder', 
      description: 'Coding-focused open model', 
      isFree: true,
      contextLimit: 32000
    },
    { 
      id: 'deepseek-coder-v2', 
      label: 'DeepSeek Coder V2', 
      description: 'Strong code model for local use', 
      isFree: true,
      contextLimit: 128000
    },
    { 
      id: 'custom', 
      label: 'Custom Model', 
      description: 'Set any model name in settings', 
      isFree: true,
      contextLimit: 32000
    }
  ]
};
