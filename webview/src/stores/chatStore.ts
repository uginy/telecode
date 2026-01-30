import { create } from 'zustand';

export interface ContextItem {
  id: string;
  name: string;
  content: string;
  type: 'file' | 'selection';
  path: string;
}

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
  
  // Actions
  addMessage: (message: Message) => void;
  updateStreamingMessage: (index: number, token: string) => void;
  setMessages: (messages: Message[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  addContext: (context: ContextItem) => void;
  removeContext: (id: string) => void;
  clearContext: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,
  error: null,
  conversationId: null,
  attachments: [],

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
      error: null
    })),

  updateStreamingMessage: (index, token) =>
    set((state) => {
      const messages = [...state.messages];
      if (messages[index]) {
        messages[index] = {
          ...messages[index],
          content: messages[index].content + token
        };
      }
      return { messages };
    }),

  setMessages: (messages) =>
    set({ messages, error: null }),

  setLoading: (isLoading) =>
    set({ isLoading }),

  setError: (error) =>
    set({ error, isLoading: false }),

  clearMessages: () =>
    set({ messages: [], error: null, attachments: [] }),

  addContext: (context) => 
    set((state) => ({
      attachments: [...state.attachments, context]
    })),

  removeContext: (id) =>
    set((state) => ({
      attachments: state.attachments.filter(a => a.id !== id)
    })),

  clearContext: () =>
    set({ attachments: [] })
}));
