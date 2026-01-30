import { create } from 'zustand';
import { ChatMetadata } from '../types/history';
import { Message } from './chatStore';

interface HistoryState {
  chats: ChatMetadata[];
  currentChatId: string | null;
  isLoading: boolean;
  
  loadHistory: () => void;
  loadChat: (chatId: string) => void;
  saveCurrentChat: (chatId: string, messages: Message[]) => void;
  deleteChat: (chatId: string) => void;
  createChat: () => void;
  setCurrentChatId: (id: string | null) => void;
  setChats: (chats: ChatMetadata[]) => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  chats: [],
  currentChatId: null,
  isLoading: false,

  loadHistory: () => {
    set({ isLoading: true });
    window.parent.postMessage({ type: 'loadHistory' }, '*');
  },

  loadChat: (chatId: string) => {
    set({ currentChatId: chatId, isLoading: true });
    window.parent.postMessage({ type: 'loadChat', chatId }, '*');
  },

  saveCurrentChat: (chatId: string, messages: Message[]) => {
    window.parent.postMessage({ type: 'saveChat', chatId, messages }, '*');
  },

  deleteChat: (chatId: string) => {
    window.parent.postMessage({ type: 'deleteChat', chatId }, '*');
  },

  createChat: () => {
    set({ isLoading: true });
    window.parent.postMessage({ type: 'createChat' }, '*');
  },

  setCurrentChatId: (id: string | null) => set({ currentChatId: id }),
  
  setChats: (chats: ChatMetadata[]) => set({ chats, isLoading: false })
}));
