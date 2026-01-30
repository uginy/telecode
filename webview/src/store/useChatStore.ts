import { create } from 'zustand';
import type { Message, ToolResult } from '@/components/chat/MessageItem';

interface Settings {
  provider: string;
  modelId: string;
  apiKey?: string;
  maxTokens: number;
  temperature: number;
  autoApprove: boolean;
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
  addToolResult: (result: ToolResult) => void;
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
    autoApprove: true,
  },
  usage: { used: 0, total: 200000 },

  addMessage: (message: Message) => 
    set((state) => ({ messages: [...state.messages, message] })),

  updateLastMessage: (content: string) =>
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

  setStreaming: (isStreaming: boolean) => set({ isStreaming }),

  setView: (activeView: 'chat' | 'settings') => set({ activeView }),

  updateSettings: (newSettings: Partial<Settings>) =>
    set((state) => ({ settings: { ...state.settings, ...newSettings } })),

  updateUsage: (usage: { used: number; total: number }) => set({ usage }),

  addToolResult: (result: ToolResult) =>
    set((state) => {
      // We assume the tool result belongs to the last assistant message
      // In a more robust system, we might need message IDs, but for streaming flow this works
      const messages = [...state.messages];
      const lastIdx = messages.findLastIndex(m => m.role === 'assistant');
      
      if (lastIdx !== -1) {
        messages[lastIdx] = {
          ...messages[lastIdx],
          toolResults: { 
            ...(messages[lastIdx].toolResults || {}), 
            [result.toolCallId]: result 
          }
        };
      }
      
      return { messages };
    }),
}));
