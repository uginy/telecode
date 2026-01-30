import * as vscode from 'vscode';
import { Message } from '../providers/base';

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

interface IndexData {
  chats: ChatMetadata[];
}

export class ChatStorage {
  private readonly _indexFileName = 'index.json';
  private readonly _chatsDirName = 'chats';
  private _storageUri: vscode.Uri;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._storageUri = _context.globalStorageUri;
  }

  async getAllChats(): Promise<ChatMetadata[]> {
    await this._ensureStorageDir();
    const index = await this._readIndex();
    return index.chats.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getChat(chatId: string): Promise<ChatData | null> {
    await this._ensureStorageDir();
    const chatPath = this._getChatFilePath(chatId);
    
    try {
      const data = await vscode.workspace.fs.readFile(chatPath);
      const chat: ChatData = JSON.parse(new TextDecoder().decode(data));
      return chat;
    } catch {
      return null;
    }
  }

  async saveChat(chatId: string, messages: Message[]): Promise<ChatMetadata> {
    await this._ensureStorageDir();
    
    const index = await this._readIndex();
    const existingIndex = index.chats.findIndex(c => c.id === chatId);
    
    const now = Date.now();
    const title = this._generateTitle(messages);
    
    const metadata: ChatMetadata = {
      id: chatId,
      title,
      createdAt: existingIndex >= 0 ? index.chats[existingIndex].createdAt : now,
      updatedAt: now,
      messageCount: messages.length
    };

    const chatData: ChatData = {
      id: chatId,
      messages
    };

    const chatPath = this._getChatFilePath(chatId);
    await vscode.workspace.fs.writeFile(
      chatPath,
      new TextEncoder().encode(JSON.stringify(chatData, null, 2))
    );

    if (existingIndex >= 0) {
      index.chats[existingIndex] = metadata;
    } else {
      index.chats.push(metadata);
    }

    await this._writeIndex(index);
    return metadata;
  }

  async deleteChat(chatId: string): Promise<void> {
    await this._ensureStorageDir();
    
    const index = await this._readIndex();
    index.chats = index.chats.filter(c => c.id !== chatId);
    await this._writeIndex(index);

    const chatPath = this._getChatFilePath(chatId);
    try {
      await vscode.workspace.fs.delete(chatPath);
    } catch {
      // File may not exist, ignore
    }
  }

  async createChat(): Promise<ChatMetadata> {
    const id = this._generateId();
    return this.saveChat(id, []);
  }

  private async _ensureStorageDir(): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(this._storageUri);
    } catch {
      // Directory may already exist
    }

    const chatsDir = vscode.Uri.joinPath(this._storageUri, this._chatsDirName);
    try {
      await vscode.workspace.fs.createDirectory(chatsDir);
    } catch {
      // Directory may already exist
    }
  }

  private async _readIndex(): Promise<IndexData> {
    const indexPath = vscode.Uri.joinPath(this._storageUri, this._indexFileName);
    
    try {
      const data = await vscode.workspace.fs.readFile(indexPath);
      return JSON.parse(new TextDecoder().decode(data));
    } catch {
      return { chats: [] };
    }
  }

  private async _writeIndex(index: IndexData): Promise<void> {
    const indexPath = vscode.Uri.joinPath(this._storageUri, this._indexFileName);
    await vscode.workspace.fs.writeFile(
      indexPath,
      new TextEncoder().encode(JSON.stringify(index, null, 2))
    );
  }

  private _getChatFilePath(chatId: string): vscode.Uri {
    return vscode.Uri.joinPath(this._storageUri, this._chatsDirName, `${chatId}.json`);
  }

  private _generateTitle(messages: Message[]): string {
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (!firstUserMessage) return 'New Chat';
    
    const content = firstUserMessage.content.trim();
    if (content.length <= 50) return content;
    return content.substring(0, 50) + '...';
  }

  private _generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  }
}
