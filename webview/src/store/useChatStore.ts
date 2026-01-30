import { create } from 'zustand';
import type { Message } from '@/components/chat/MessageItem';

interface Settings {
  provider: string;
  modelId: string;
  maxTokens: number;
  temperature: number;
}

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  settings: Settings;
  
  // Actions
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;
  clearHistory: () => void;
  setStreaming: (isStreaming: boolean) => void;
  updateSettings: (settings: Partial<Settings>) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  settings: {
    provider: 'openrouter',
    modelId: 'google/gemini-2.0-flash-exp:free',
    maxTokens: 4096,
    temperature: 0.7,
  },

  addMessage: (message) => 
    set((state) => ({ messages: [...state.messages, message] })),

  updateLastMessage: (content) =>
    set((state) => {
      const last = state.messages[state.messages.length - 1];
      if (last && last.role === 'assistant') {
        const updatedMessages = [...state.messages.slice(0, -1), { ...last, content: last.content + content }];
        return { messages: updatedMessages };
      }
      return state;
    }),

  clearHistory: () => set({ messages: [] }),

  setStreaming: (isStreaming) => set({ isStreaming }),

  updateSettings: (newSettings) =>
    set((state) => ({ settings: { ...state.settings, ...newSettings } })),
}));
