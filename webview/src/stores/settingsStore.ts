import { create } from 'zustand';
import type { SettingsConfig } from '../components/Settings/SettingsPanel';

interface SettingsState {
  config: SettingsConfig;
  isOpen: boolean;
  isConfigured: boolean;
  isHistoryOpen: boolean;
  isApprovalsOpen: boolean;
  searchQuery: string;
  activeSectionId: string;
  openSettings: () => void;
  closeSettings: () => void;
  openHistory: () => void;
  closeHistory: () => void;
  openApprovals: () => void;
  closeApprovals: () => void;
  setConfig: (config: SettingsConfig) => void;
  setSearchQuery: (query: string) => void;
  setActiveSectionId: (id: string) => void;
}

const DEFAULT_CONFIG: SettingsConfig = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:11434/v1',
  apiKey: '',
  model: 'llama3.2',
  autoApprove: false,
  diffOnly: true,
  workspaceIndex: true,
  maxTokens: 4096,
  temperature: 0.7
};

export const useSettingsStore = create<SettingsState>((set) => ({
  config: DEFAULT_CONFIG,
  isOpen: false,
  isConfigured: true, // OpenAI-compatible is always configured
  isHistoryOpen: false,
  isApprovalsOpen: false,
  searchQuery: '',
  activeSectionId: 'general',
  
  openSettings: () => set({ isOpen: true }),
  closeSettings: () => set({ isOpen: false }),
  openHistory: () => set({ isHistoryOpen: true }),
  closeHistory: () => set({ isHistoryOpen: false }),
  openApprovals: () => set({ isApprovalsOpen: true }),
  closeApprovals: () => set({ isApprovalsOpen: false }),
  
  setConfig: (config: SettingsConfig) => {
    const isConfigured = config.provider === 'openai-compatible' || !!config.apiKey;
    set({ config, isConfigured });
  },

  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setActiveSectionId: (id: string) => set({ activeSectionId: id })
}));
