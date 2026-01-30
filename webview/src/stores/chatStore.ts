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
  status: string | null;
  conversationId: string | null;
  attachments: ContextItem[];
  
  addMessage: (message: Message) => void;
  updateStreamingMessage: (index: number, token: string) => void;
  setMessages: (messages: Message[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setStatus: (status: string | null) => void;
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
  status: null,
  conversationId: null,
  attachments: [],

  addMessage: (message) => {
    const normalizedMessage = normalizeToolTagsInMessage(message);
    const newMessages = [...get().messages, normalizedMessage];
    set({ messages: newMessages, error: null });
    triggerAutoSave(get().conversationId, newMessages);
  },

  updateStreamingMessage: (index, token) => {
    set((state) => {
      const messages = [...state.messages];
      if (messages[index]) {
        const mergedContent = messages[index].content + token;
        messages[index] = {
          ...messages[index],
          content: normalizeToolTags(mergedContent)
        };
      }
      return { messages };
    });
  },

  setMessages: (messages) => {
    const normalizedMessages = messages.map(normalizeToolTagsInMessage);
    set({ messages: normalizedMessages });
    triggerAutoSave(get().conversationId, normalizedMessages);
  },
  
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setStatus: (status) => set({ status }),
  
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

function normalizeToolTagsInMessage(message: Message) {
  if (!message.content) {
    return message;
  }
  return {
    ...message,
    content: normalizeToolTags(message.content)
  };
}

function normalizeToolTags(content: string) {
  if (!content) return content;

  let next = content;
  next = next.replace(/<run_command>([\s\S]*?)<\/run_command>/g, (_match, cmd) => {
    const command = String(cmd).trim();
    return buildToolBlock({ type: 'run_command', command });
  });
  next = next.replace(/<read_file>([\s\S]*?)<\/read_file>/g, (_match, path) => {
    const target = String(path).trim();
    return buildToolBlock({ type: 'read_file', path: target });
  });
  next = next.replace(/<list_files>([\s\S]*?)<\/list_files>/g, (_match, path) => {
    const target = String(path).trim();
    return buildToolBlock({ type: 'list_files', path: target });
  });
  next = next.replace(/<write_file\s+path="([^"]+)">([\s\S]*?)<\/write_file>/g, (_match, path, body) => {
    const target = String(path).trim();
    const size = typeof body === 'string' ? body.length : 0;
    return buildToolBlock({ type: 'write_file', path: target, size });
  });

  return next;
}

function buildToolBlock(payload: Record<string, unknown>) {
  return `\n\n\`\`\`tool\n${JSON.stringify(payload)}\n\`\`\`\n\n`;
}
