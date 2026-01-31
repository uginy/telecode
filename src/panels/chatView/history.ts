import type * as vscode from 'vscode';
import type { Message } from '../../core/types';
import type { SessionManager } from '../../core/session/SessionManager';

function attachToolResults(history: Message[]): Message[] {
  return history.map((msg, index) => {
    if (msg.role === 'assistant') {
      const toolResults: { toolCallId: string; output: string; isError: boolean }[] = [];
      let i = index + 1;
      while (i < history.length && history[i].role === 'tool') {
        const toolMsg = history[i];
        if (toolMsg.toolResult) {
          toolResults.push(toolMsg.toolResult);
        } else {
          toolResults.push({
            toolCallId: 'unknown',
            output: toolMsg.content,
            isError: false
          });
        }
        i++;
      }

      if (toolResults.length > 0) {
        return { ...msg, toolResults };
      }
    }
    return msg;
  });
}

export async function hydrateHistory(
  view: vscode.WebviewView | undefined,
  sessionManager: SessionManager
) {
  if (!view) return;

  if (!sessionManager.activeSessionId && sessionManager.sessions.length === 0) {
    await sessionManager.createSession('New Chat');
  } else if (!sessionManager.activeSessionId && sessionManager.sessions.length > 0) {
    await sessionManager.setActiveSession(sessionManager.sessions[0].id);
  }

  const history = sessionManager.activeSession?.messages || [];
  const processedHistory = attachToolResults(history);

  view.webview.postMessage({
    type: 'hydrateHistory',
    history: processedHistory
  });
}

export async function clearHistory(
  sessionManager: SessionManager,
  view: vscode.WebviewView | undefined
) {
  if (!sessionManager.activeSessionId) return;
  await sessionManager.saveMessages(sessionManager.activeSessionId, []);
  await hydrateHistory(view, sessionManager);
}
