import { Message } from '../stores/chatStore';

export interface ChatMetadata {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface ChatData {
  id: string;
  messages: Message[];
}

export type HistoryMessage =
  | { type: 'loadHistory' }
  | { type: 'loadChat'; chatId: string }
  | { type: 'saveChat'; chatId: string; messages: Message[] }
  | { type: 'deleteChat'; chatId: string }
  | { type: 'createChat' };

export interface HistoryResponse {
  type: 'historyLoaded' | 'chatLoaded' | 'chatSaved' | 'chatDeleted' | 'chatCreated';
  chats?: ChatMetadata[];
  chatId?: string;
  messages?: Message[];
  metadata?: ChatMetadata;
}
