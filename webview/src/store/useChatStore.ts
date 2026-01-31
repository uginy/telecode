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

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

interface ChatState {
  messages: Message[];
  sessions: Session[];
  activeSessionId: string | null;
  isStreaming: boolean;
  activeView: 'chat' | 'settings' | 'history'; // Added 'history' view?
  settings: Settings;
  usage: { used: number; total: number };
  
  // Actions
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  updateLastMessage: (content: string) => void;
  clearHistory: () => void;
  setStreaming: (isStreaming: boolean) => void;
  setView: (view: 'chat' | 'settings' | 'history') => void;
  updateSettings: (settings: Partial<Settings>) => void;
  updateUsage: (usage: { used: number; total: number }) => void;
  addToolResult: (result: ToolResult) => void;
  setSessions: (sessions: Session[]) => void;
  setActiveSessionId: (id: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  sessions: [],
  activeSessionId: null,
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

  setMessages: (messages: Message[]) => set({ messages }),

  updateLastMessage: (content: string) =>
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];

      if (last && last.role === 'assistant') {
        messages[messages.length - 1] = {
          ...last,
          content: last.content + content
        };
      } else {
        // Create new assistant message if it doesn't exist
        messages.push({
          id: Math.random().toString(36).substring(2, 9),
          role: 'assistant',
          content: content
        });
      }
      
      return { messages };
    }),

  clearHistory: () => set({ messages: [] }),

  setStreaming: (isStreaming: boolean) => set({ isStreaming }),

  setView: (activeView: 'chat' | 'settings' | 'history') => set({ activeView }),

  updateSettings: (newSettings: Partial<Settings>) =>
    set((state) => ({ settings: { ...state.settings, ...newSettings } })),

  updateUsage: (usage: { used: number; total: number }) => set({ usage }),

  addToolResult: (result: ToolResult) =>
    set((state) => {
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

  setSessions: (sessions: Session[]) => set({ sessions }),
  setActiveSessionId: (id: string) => set({ activeSessionId: id }),
}));
