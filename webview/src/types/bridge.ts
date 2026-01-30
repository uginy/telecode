import type { Message } from '../stores/chatStore';

export type ContextType = 'file' | 'folder' | 'terminal' | 'problems' | 'git' | 'selection';

export interface ContextItem {
  id: string;
  name: string;
  description?: string;
  type: ContextType;
  path: string;
  content?: string;
  icon?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  isFree?: boolean;
}

export interface ChatMetadata {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export type ApprovalKind = 'read' | 'write' | 'list' | 'apply' | 'delete' | 'command';

export interface ApprovalRequest {
  requestId: string;
  kind: ApprovalKind;
  title: string;
  description: string;
  detail?: string;
  path?: string;
}

export type WebviewMessage =
  | { type: 'sendMessage'; content: string }
  | { type: 'getMessages' }
  | { type: 'getConfig' }
  | { type: 'saveConfig'; config: { provider: string; baseUrl: string; apiKey: string; model: string; maxTokens?: number; temperature?: number; autoApprove?: boolean; diffOnly?: boolean; workspaceIndex?: boolean } }
  | { type: 'fetchModels'; provider: string; apiKey?: string }
  | { type: 'abortGeneration' }
  | { type: 'newConversation' }
  | { type: 'runCommand'; command: string }
  | { type: 'getContext' }
  | { type: 'searchContext'; query: string; contextType?: ContextType }
  | { type: 'requestContextItem'; path: string; contextType: ContextType }
  | { type: 'reviewDiff'; code: string; language: string; targetPath?: string }
  | { type: 'applyDiff'; code: string; targetPath?: string }
  | { type: 'loadHistory' }
  | { type: 'loadChat'; chatId: string }
  | { type: 'saveChat'; chatId: string; messages: Message[] }
  | { type: 'deleteChat'; chatId: string }
  | { type: 'createChat' }
  | { type: 'approvalResponse'; requestId: string; decision: 'approve' | 'deny' };

export type ExtensionMessage =
  | { type: 'messages'; messages: Message[]; conversationId: string }
  | { type: 'messageAdded'; message: Message; isStreaming?: boolean }
  | { type: 'streamToken'; messageIndex: number; token: string }
  | { type: 'streamComplete' }
  | { type: 'status'; status: string | null }
  | { type: 'error'; message: string }
  | { type: 'config'; config: { provider: string; baseUrl: string; apiKey: string; model: string; maxTokens?: number; temperature?: number; autoApprove?: boolean; diffOnly?: boolean; workspaceIndex?: boolean } }
  | { type: 'modelsFound'; provider: string; models: ModelInfo[] }
  | { type: 'contextAdded'; context: ContextItem }
  | { type: 'searchContextResults'; items: ContextItem[] }
  | { type: 'conversationCleared' }
  | { type: 'historyLoaded'; chats: ChatMetadata[] }
  | { type: 'chatLoaded'; chatId: string; messages: Message[] }
  | { type: 'chatSaved'; metadata: ChatMetadata }
  | { type: 'chatDeleted'; chatId: string }
  | { type: 'chatCreated'; metadata: ChatMetadata }
  | { type: 'approvalRequest'; request: ApprovalRequest };
