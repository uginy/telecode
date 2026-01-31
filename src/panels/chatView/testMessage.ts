import type * as vscode from 'vscode';
import type { ToolRegistry } from '../../core/tools/registry';
import type { SessionManager } from '../../core/session/SessionManager';
import type { ProviderAdapter } from '../../core/providers/ProviderAdapter';
import type { ToolCall } from '../../core/types';
import type { AgentOrbit } from '../../core/agent/AgentOrbit';
import { handleSendMessage } from './sendMessage';

interface TestMessageDeps {
  toolRegistry: ToolRegistry;
  sessionManager: SessionManager;
  createProviderAdapter: () => Promise<ProviderAdapter | null>;
  getAgent: () => AgentOrbit | undefined;
  setAgent: (agent?: AgentOrbit) => void;
  lastActiveEditor?: vscode.TextEditor;
  saveHistory: () => Promise<void>;
}

interface TestMessagePayload {
  text: string;
  contextItems?: { type: string; value: string }[];
  timeoutMs?: number;
}

export async function runTestMessage(
  deps: TestMessageDeps,
  payload: TestMessagePayload
) {
  const events = {
    tokens: '',
    toolCalls: [] as ToolCall[],
    toolResults: [] as { toolCallId: string; output: string; isError: boolean }[],
    statuses: [] as string[]
  };

  const timeoutMs = payload.timeoutMs ?? 120000;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Test run timed out'));
    }, timeoutMs);

    const view = {
      webview: {
        postMessage: (message: { type: string; [key: string]: unknown }) => {
          switch (message.type) {
            case 'streamToken':
              events.tokens += String(message.text ?? '');
              break;
            case 'toolCalls':
              events.toolCalls.push(...((message.calls as ToolCall[]) || []));
              break;
            case 'toolResult':
              events.toolResults.push(message.result as { toolCallId: string; output: string; isError: boolean });
              break;
            case 'assistantStatus':
              if (message.status && typeof message.status === 'object') {
                const statusKey = (message.status as { key?: string }).key;
                if (statusKey) events.statuses.push(statusKey);
              }
              break;
            case 'setStreaming':
              if (message.value === false) {
                clearTimeout(timer);
                resolve({
                  responseText: events.tokens,
                  toolCalls: events.toolCalls,
                  toolResults: events.toolResults,
                  statuses: events.statuses
                });
              }
              break;
            default:
              break;
          }
        }
      }
    } as unknown as vscode.WebviewView;

    void handleSendMessage(
      {
        view,
        toolRegistry: deps.toolRegistry,
        sessionManager: deps.sessionManager,
        createProviderAdapter: deps.createProviderAdapter,
        getAgent: deps.getAgent,
        setAgent: deps.setAgent,
        lastActiveEditor: deps.lastActiveEditor,
        saveHistory: deps.saveHistory
      },
      payload.text,
      payload.contextItems
    ).catch((error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
