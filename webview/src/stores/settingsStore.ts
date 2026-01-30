import { create } from 'zustand';
import type { SettingsConfig } from '../components/Settings/SettingsPanel';

interface SettingsState {
  config: SettingsConfig;
  isOpen: boolean;
  isConfigured: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  setConfig: (config: SettingsConfig) => void;
}

const DEFAULT_CONFIG: SettingsConfig = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:11434/v1',
  apiKey: '',
  model: 'llama3.2'
};

export const useSettingsStore = create<SettingsState>((set) => ({
  config: DEFAULT_CONFIG,
  isOpen: false,
  isConfigured: true, // OpenAI-compatible is always configured
  
  openSettings: () => set({ isOpen: true }),
  closeSettings: () => set({ isOpen: false }),
  
  setConfig: (config: SettingsConfig) => {
    const isConfigured = config.provider === 'openai-compatible' || !!config.apiKey;
    set({ config, isConfigured });
  }
}));
