import * as vscode from 'vscode';
import { AgentOrbit } from '../../core/agent/AgentOrbit';
import type { ToolRegistry } from '../../core/tools/registry';
import type { SessionManager } from '../../core/session/SessionManager';
import type { ProviderAdapter } from '../../core/providers/ProviderAdapter';
import { buildContext } from './contextBuilder';

interface SendMessageDeps {
  view?: vscode.WebviewView;
  toolRegistry: ToolRegistry;
  sessionManager: SessionManager;
  createProviderAdapter: () => Promise<ProviderAdapter | null>;
  getAgent: () => AgentOrbit | undefined;
  setAgent: (agent?: AgentOrbit) => void;
  lastActiveEditor?: vscode.TextEditor;
  saveHistory: () => Promise<void>;
}

export async function handleSendMessage(
  deps: SendMessageDeps,
  text: string,
  contextItems?: { type: string; value: string }[]
) {
  if (!deps.getAgent()) {
    const providerAdapter = await deps.createProviderAdapter();
    if (!providerAdapter) return;

    const agent = new AgentOrbit(providerAdapter, deps.toolRegistry);

    const history = deps.sessionManager.activeSession?.messages || [];
    if (history.length > 0) {
      agent.setHistory(history);
    }
    deps.setAgent(agent);
  }

  const agent = deps.getAgent();
  if (!agent) return;

  let fullContext = '';

  try {
    const context = await buildContext({
      text,
      contextItems,
      lastActiveEditor: deps.lastActiveEditor
    });
    fullContext = context.contextDetails;
    deps.view?.webview.postMessage({ type: 'contextSnapshot', snapshot: context.snapshot });

    if (fullContext) {
      const message = contextItems && contextItems.length > 0
        ? 'AIS Code: Using explicit context and workspace.'
        : 'AIS Code: Using context from open tabs and workspace.';
      vscode.window.showInformationMessage(message, { modal: false });
    } else if (!contextItems || contextItems.length === 0) {
      vscode.window.showWarningMessage('AIS Code: No context found (open tabs or explicit items).');
    }

    agent.updateSystemContext(context.workspaceSummary, fullContext);
  } catch (e) {
    console.error('Failed to load context:', e);
  }

  deps.view?.webview.postMessage({ type: 'setStreaming', value: true });

  let promptText = text;
  const languageInstruction = '[IMPORTANT: Respond in the SAME LANGUAGE as the user input.]';
  const toolCallInstruction = '[ACTION: Provide a brief 1-sentence summary of fixes, then call <replace_in_file> or <write_file> IMMEDIATELY. NO MARKDOWN CODE BLOCKS.]';

  if (text.trim().startsWith('/fix')) {
    promptText = `${languageInstruction}\n${toolCallInstruction}\n[CRITICAL INSTRUCTION: Analyze the code below and fix it. Use tools directly.]\n\nCODE CONTEXT:\n${fullContext}\n\nUSER COMMAND: ${text}`;
  } else if (text.trim().startsWith('/explain')) {
    promptText = `${languageInstruction}\n[INSTRUCTION: Explain the code below.]\n\nCODE CONTEXT:\n${fullContext}\n\nUSER COMMAND: ${text}`;
  } else if (text.trim().startsWith('/test')) {
    promptText = `${languageInstruction}\n${toolCallInstruction}\n[INSTRUCTION: Write tests for the code below.]\n\nCODE CONTEXT:\n${fullContext}\n\nUSER COMMAND: ${text}`;
  }

  const trimmedCommand = text.trim();
  const needsFileContext =
    trimmedCommand.startsWith('/fix') ||
    trimmedCommand.startsWith('/test') ||
    trimmedCommand.startsWith('/explain');

  if (!fullContext && needsFileContext) {
    deps.view?.webview.postMessage({
      type: 'streamToken',
      text: '> [!CAUTION]\n> **AIS Code**: Не удалось найти активный файл. Откройте файл или добавьте контекст через @.'
    });
  }

  try {
    await agent.run(
      promptText,
      (chunk: string) => {
        deps.view?.webview.postMessage({ type: 'streamToken', text: chunk });
      },
      (result: { toolCallId: string; output: string; isError: boolean }) => {
        deps.view?.webview.postMessage({ type: 'toolResult', result });
      }
    );

    const usage = agent.getUsage();
    deps.view?.webview.postMessage({ type: 'updateUsage', usage });
  } catch (error: unknown) {
    const e = error as Error;
    deps.view?.webview.postMessage({ type: 'streamToken', text: `\n\n**Error**: ${e.message || 'Unknown error occurred'}` });
    console.error('Chat execution error:', e);
  } finally {
    deps.view?.webview.postMessage({ type: 'setStreaming', value: false });
    await deps.saveHistory();
  }
}
