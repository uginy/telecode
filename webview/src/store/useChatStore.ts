import { create } from 'zustand';
import type { Message, ToolResult } from '@/components/chat/MessageItem';

interface Settings {
  provider: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
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

export interface SearchResult {
  type: 'file' | 'folder' | 'terminal';
  label: string;
  value: string;
}

export interface Checkpoint {
  id: string;
  filePath: string;
  timestamp: number;
  description: string;
  existed: boolean;
}

export interface ContextSnapshotItem {
  label: string;
  content: string;
  truncated: boolean;
}

export interface ContextSnapshotSection {
  title: string;
  items: ContextSnapshotItem[];
}

export interface ContextSnapshot {
  totalChars: number;
  maxChars: number;
  usedSearch: boolean;
  usedSemantic: boolean;
  sections: ContextSnapshotSection[];
}

interface ChatState {
  messages: Message[];
  sessions: Session[];
  activeSessionId: string | null;
  isStreaming: boolean;
  activeView: 'chat' | 'settings' | 'history' | 'context'; 
  settings: Settings;
  usage: { used: number; total: number };
  sessionAllowAllTools: boolean;
  sessionAllowedTools: string[];
  
  // Actions
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  updateLastMessage: (content: string) => void;
  clearHistory: () => void;
  setStreaming: (isStreaming: boolean) => void;
  setView: (view: 'chat' | 'settings' | 'history' | 'context') => void;
  updateSettings: (settings: Partial<Settings>) => void;
  updateUsage: (usage: { used: number; total: number }) => void;
  addToolResult: (result: ToolResult) => void;
  setSessions: (sessions: Session[]) => void;
  setActiveSessionId: (id: string) => void;
  setSessionAllowAllTools: (value: boolean) => void;
  setSessionAllowedTools: (tools: string[]) => void;

  searchResults: SearchResult[];
  setSearchResults: (results: SearchResult[]) => void;

  contextItems: SearchResult[];
  setContextItems: (items: SearchResult[]) => void;
  addContextItem: (item: SearchResult) => void;
  removeContextItem: (value: string) => void;

  checkpoints: Checkpoint[];
  setCheckpoints: (checkpoints: Checkpoint[]) => void;
  lastContextSnapshot: ContextSnapshot | null;
  setLastContextSnapshot: (snapshot: ContextSnapshot | null) => void;
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
    baseUrl: '',
    maxTokens: 4096,
    temperature: 0.7,
    autoApprove: true,
  },
  usage: { used: 0, total: 200000 },
  sessionAllowAllTools: false,
  sessionAllowedTools: [],

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

  setView: (activeView: 'chat' | 'settings' | 'history' | 'context') => set({ activeView }),

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
  setSessionAllowAllTools: (value: boolean) => set({ sessionAllowAllTools: value }),
  setSessionAllowedTools: (tools: string[]) => set({ sessionAllowedTools: tools }),
  
  searchResults: [] as SearchResult[],
  setSearchResults: (results: SearchResult[]) => set({ searchResults: results }),

  contextItems: [] as SearchResult[],
  setContextItems: (items: SearchResult[]) => set({ contextItems: items }),
  addContextItem: (item: SearchResult) => set((state) => {
      if (state.contextItems.some(i => i.value === item.value && i.type === item.type)) return {};
      return { contextItems: [...state.contextItems, item] };
  }),
  removeContextItem: (value: string) => set((state) => ({
      contextItems: state.contextItems.filter(i => i.value !== value)
  })),

  checkpoints: [],
  setCheckpoints: (checkpoints: Checkpoint[]) => set({ checkpoints }),
  lastContextSnapshot: null,
  setLastContextSnapshot: (snapshot: ContextSnapshot | null) => set({ lastContextSnapshot: snapshot }),
}));
