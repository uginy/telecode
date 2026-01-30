import { create } from 'zustand';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  conversationId: string | null;
  
  // Actions
  addMessage: (message: Message) => void;
  updateStreamingMessage: (index: number, token: string) => void;
  setMessages: (messages: Message[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,
  error: null,
  conversationId: null,

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
    set({ messages: [], error: null })
}));
