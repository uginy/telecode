
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type { Session, Message } from '../types';

export class SessionManager {
  private static readonly STORAGE_KEY = 'chatSessions';
  private static readonly ACTIVE_ID_KEY = 'activeSessionId';

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async init() {
    await this._migrateLegacyHistory();
  }

  public get sessions(): Session[] {
    return this.context.workspaceState.get<Session[]>(SessionManager.STORAGE_KEY) || [];
  }

  public get activeSessionId(): string | undefined {
    return this.context.workspaceState.get<string>(SessionManager.ACTIVE_ID_KEY);
  }

  public get activeSession(): Session | undefined {
    const id = this.activeSessionId;
    return id ? this.sessions.find(s => s.id === id) : undefined;
  }

  public async setSessions(sessions: Session[]) {
    await this.context.workspaceState.update(SessionManager.STORAGE_KEY, sessions);
  }

  public async setActiveSession(id: string) {
    await this.context.workspaceState.update(SessionManager.ACTIVE_ID_KEY, id);
  }

  public async createSession(title: string = 'New Chat'): Promise<Session> {
    const newSession: Session = {
      id: crypto.randomUUID(),
      title,
      messages: [],
      updatedAt: Date.now()
    };
    
    const sessions = [newSession, ...this.sessions];
    await this.setSessions(sessions);
    await this.setActiveSession(newSession.id);
    
    return newSession;
  }

  public async updateSession(id: string, updates: Partial<Session>) {
    const sessions = this.sessions.map(s => 
      s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
    );
    await this.setSessions(sessions);
  }

  public async deleteSession(id: string) {
    const sessions = this.sessions.filter(s => s.id !== id);
    await this.setSessions(sessions);
    
    if (this.activeSessionId === id) {
      // Switch to most recent or none
      const next = sessions[0];
      await this.setActiveSession(next ? next.id : '');
    }
  }

  public async getSession(id: string): Promise<Session | undefined> {
    return this.sessions.find(s => s.id === id);
  }

  public async saveMessages(sessionId: string, messages: Message[]) {
    // Filter out system messages for storage
    const uniqueMessages = messages.filter(m => m.role !== 'system');
    await this.updateSession(sessionId, { messages: uniqueMessages });
  }

  private async _migrateLegacyHistory() {
    const legacyHistory = this.context.workspaceState.get<Message[]>('chatHistory');
    if (legacyHistory && legacyHistory.length > 0) {
      // Check if we already have sessions
      if (this.sessions.length === 0) {
        const session: Session = {
          id: crypto.randomUUID(),
          title: 'Previous Chat',
          messages: legacyHistory,
          updatedAt: Date.now()
        };
        await this.setSessions([session]);
        await this.setActiveSession(session.id);
        
        // Clear legacy
        await this.context.workspaceState.update('chatHistory', undefined);
      }
    }
  }
}
