import type { LucideIcon } from 'lucide-react';

export interface ModelDefinition {
  id: string;
  label: string;
  description: string;
  isFree: boolean;
  contextLimit?: number;
  maxOutput?: number;
  inputPrice?: string;
  outputPrice?: string;
}

export interface ProviderDefinition {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  apiKeyPlaceholder: string;
  apiKeyUrl: string;
  models: ModelDefinition[];
}
