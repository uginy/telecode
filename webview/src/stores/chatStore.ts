import { create } from 'zustand';
import { ContextItem } from '../types/context';
import { useHistoryStore } from './historyStore';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  context?: ContextItem[];
}

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  conversationId: string | null;
  attachments: ContextItem[];
  
  addMessage: (message: Message) => void;
  updateStreamingMessage: (index: number, token: string) => void;
  setMessages: (messages: Message[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  addContext: (context: ContextItem) => void;
  updateContext: (id: string, updates: Partial<ContextItem>) => void;
  removeContext: (id: string) => void;
  clearContext: () => void;
  saveCurrentChat: () => void;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

const triggerAutoSave = (chatId: string | null, messages: Message[]) => {
  if (!chatId) return;
  
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  saveTimeout = setTimeout(() => {
    useHistoryStore.getState().saveCurrentChat(chatId, messages);
  }, 2000);
};

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  error: null,
  conversationId: null,
  attachments: [],

  addMessage: (message) => {
    const newMessages = [...get().messages, message];
    set({ messages: newMessages, error: null });
    triggerAutoSave(get().conversationId, newMessages);
  },

  updateStreamingMessage: (index, token) => {
    set((state) => {
      const messages = [...state.messages];
      if (messages[index]) {
        messages[index] = {
          ...messages[index],
          content: messages[index].content + token
        };
      }
      return { messages };
    });
  },

  setMessages: (messages) => {
    set({ messages });
    triggerAutoSave(get().conversationId, messages);
  },
  
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  
  clearMessages: () => set({ 
    messages: [], 
    error: null, 
    conversationId: null
  }),

  addContext: (context) => 
    set((state) => {
      if (state.attachments.some(a => a.id === context.id)) return state;
      return { attachments: [...state.attachments, context] };
    }),
    
  updateContext: (id, updates) =>
    set((state) => ({
      attachments: state.attachments.map(a => 
        a.id === id ? { ...a, ...updates } : a
      )
    })),

  removeContext: (id) =>
    set((state) => ({
      attachments: state.attachments.filter(a => a.id !== id)
    })),

  clearContext: () => set({ attachments: [] }),

  saveCurrentChat: () => {
    const { conversationId, messages } = get();
    if (conversationId && messages.length > 0) {
      useHistoryStore.getState().saveCurrentChat(conversationId, messages);
    }
  }
}));
