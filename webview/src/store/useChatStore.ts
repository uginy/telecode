import { create } from 'zustand';
import type { Message } from '@/components/chat/MessageItem';

interface Settings {
  provider: string;
  modelId: string;
  apiKey?: string;
  maxTokens: number;
  temperature: number;
}

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  activeView: 'chat' | 'settings';
  settings: Settings;
  usage: { used: number; total: number };
  
  // Actions
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;
  clearHistory: () => void;
  setStreaming: (isStreaming: boolean) => void;
  setView: (view: 'chat' | 'settings') => void;
  updateSettings: (settings: Partial<Settings>) => void;
  updateUsage: (usage: { used: number; total: number }) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  activeView: 'chat',
  settings: {
    provider: 'openrouter',
    modelId: 'google/gemini-2.0-flash-exp:free',
    apiKey: '',
    maxTokens: 4096,
    temperature: 0.7,
  },
  usage: { used: 0, total: 200000 },

  addMessage: (message) => 
    set((state) => ({ messages: [...state.messages, message] })),

  updateLastMessage: (content) =>
    set((state) => {
      const last = state.messages[state.messages.length - 1];
      if (last && last.role === 'assistant') {
        const updatedMessages = [...state.messages.slice(0, -1), { 
          ...last, 
          content: last.content + content 
        }];
        return { messages: updatedMessages };
      }
      return state;
    }),

  clearHistory: () => set({ messages: [] }),

  setStreaming: (isStreaming) => set({ isStreaming }),

  setView: (activeView) => set({ activeView }),

  updateSettings: (newSettings) =>
    set((state) => ({ settings: { ...state.settings, ...newSettings } })),

  updateUsage: (usage) => set({ usage }),
}));
