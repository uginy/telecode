import type * as vscode from 'vscode';
import type { AgentOrbit } from '../../core/agent/AgentOrbit';
import type { SessionManager } from '../../core/session/SessionManager';
import { generateSessionSummaryPrompt } from '../../core/prompts';

export async function sendSessionList(
  view: vscode.WebviewView | undefined,
  sessionManager: SessionManager
) {
  if (!view) return;
  view.webview.postMessage({
    type: 'updateSessionList',
    sessions: sessionManager.sessions,
    activeSessionId: sessionManager.activeSessionId
  });
}

export async function saveHistory(options: {
  agent?: AgentOrbit;
  sessionManager: SessionManager;
  view?: vscode.WebviewView;
  createProviderAdapter: () => Promise<{ complete: (messages: any[], options: { stream?: boolean; signal?: AbortSignal; overrides?: { modelId?: string; maxTokens?: number; temperature?: number } }) => Promise<AsyncIterable<string> | string> } | null>;
}) {
  const { agent, sessionManager, view, createProviderAdapter } = options;
  if (!agent) return;
  const messages = agent.getMessages();
  const activeId = sessionManager.activeSessionId;
  if (!activeId) return;

  await sessionManager.saveMessages(activeId, messages);
  await sendSessionList(view, sessionManager);

  const session = await sessionManager.getSession(activeId);
  if (!session || session.title !== 'New Chat') return;

  const contentMessages = messages.filter(m => m.role !== 'system');
  if (contentMessages.length < 2 || contentMessages.length > 4) return;

  try {
    const providerAdapter = await createProviderAdapter();
    if (!providerAdapter) return;

    const promptMessages = contentMessages.map(m => ({
      role: m.role,
      content: m.content
    }));

    const prompt = generateSessionSummaryPrompt(promptMessages);
    const response = await providerAdapter.complete([
      { role: 'user', content: prompt, id: 'summary-request', timestamp: Date.now() }
    ], { stream: false });

    let title = typeof response === 'string' ? response : '';
    if (!title && typeof response !== 'string') {
      for await (const chunk of response) {
        title += chunk;
      }
    }

    title = title.trim().replace(/^["']|["']$/g, '');
    if (title) {
      await sessionManager.updateSession(activeId, { title });
      await sendSessionList(view, sessionManager);
    }
  } catch (e) {
    console.error('Failed to summarize title:', e);
  }
}
