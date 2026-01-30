import { create } from 'zustand';
import { ChatMetadata } from '../types/history';
import { Message } from './chatStore';
import { getVSCodeApi } from '../lib/vscodeApi';

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
    getVSCodeApi().postMessage({ type: 'loadHistory' });
  },

  loadChat: (chatId: string) => {
    set({ currentChatId: chatId, isLoading: true });
    getVSCodeApi().postMessage({ type: 'loadChat', chatId });
  },

  saveCurrentChat: (chatId: string, messages: Message[]) => {
    getVSCodeApi().postMessage({ type: 'saveChat', chatId, messages });
  },

  deleteChat: (chatId: string) => {
    getVSCodeApi().postMessage({ type: 'deleteChat', chatId });
  },

  createChat: () => {
    set({ isLoading: true });
    getVSCodeApi().postMessage({ type: 'createChat' });
  },

  setCurrentChatId: (id: string | null) => set({ currentChatId: id }),
  
  setChats: (chats: ChatMetadata[]) => set({ chats, isLoading: false })
}));
