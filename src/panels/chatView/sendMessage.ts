import * as vscode from 'vscode';
import { AgentOrbit } from '../../core/agent/AgentOrbit';
import type { ToolRegistry } from '../../core/tools/registry';
import type { SessionManager } from '../../core/session/SessionManager';
import type { ProviderAdapter } from '../../core/providers/ProviderAdapter';
import { getWorkspaceSummary } from '../../utils/workspace';

const MAX_TOTAL_CONTEXT_CHARS = 120000;
const MAX_FILE_CONTEXT_CHARS = 40000;

function appendContextChunk(state: { content: string; used: number }, chunk: string) {
  if (state.used >= MAX_TOTAL_CONTEXT_CHARS) return;
  const remaining = MAX_TOTAL_CONTEXT_CHARS - state.used;
  const sliced = chunk.length > remaining ? `${chunk.slice(0, remaining)}\n[...truncated]` : chunk;
  state.content += sliced;
  state.used += sliced.length;
}

function getOpenTabUris(): vscode.Uri[] {
  const uris: vscode.Uri[] = [];
  const seen = new Set<string>();

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText) {
        const uri = tab.input.uri;
        const key = uri.toString();
        if (!seen.has(key) && uri.scheme === 'file') {
          seen.add(key);
          uris.push(uri);
        }
      }
    }
  }

  return uris;
}

async function getDocumentText(uri: vscode.Uri): Promise<string> {
  const existing = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
  if (existing) return existing.getText();
  const doc = await vscode.workspace.openTextDocument(uri);
  return doc.getText();
}

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

  const contextState = { content: '', used: 0 };

  try {
    const summary = await getWorkspaceSummary();
    const hasExplicitContext = !!(contextItems && contextItems.length > 0);
    const shouldUseOpenTabs = !hasExplicitContext && !text.includes('@');

    if (hasExplicitContext) {
      appendContextChunk(contextState, '\n[Explicit Context Items]\n');
      for (const item of contextItems || []) {
        try {
          if (item.type === 'file') {
            const uris = await vscode.workspace.findFiles(item.value, null, 1);
            if (uris.length > 0) {
              const fileBytes = await vscode.workspace.fs.readFile(uris[0]);
              const content = new TextDecoder().decode(fileBytes);
              const trimmed = content.slice(0, MAX_FILE_CONTEXT_CHARS);
              appendContextChunk(
                contextState,
                `File: ${item.value}\nContent:\n\`\`\`\n${trimmed}\n\`\`\`\n`
              );
            }
          } else if (item.type === 'folder') {
            appendContextChunk(contextState, `Folder: ${item.value}\n`);
          } else if (item.type === 'terminal') {
            appendContextChunk(contextState, `Terminal: ${item.value}\n`);
          }
        } catch (e) {
          console.warn(`Failed to read context item ${item.value}:`, e);
        }
      }
    }

    if (shouldUseOpenTabs) {
      const openUris = getOpenTabUris();
      const activeUri = vscode.window.activeTextEditor?.document.uri || deps.lastActiveEditor?.document.uri;

      if (openUris.length > 0) {
        appendContextChunk(contextState, '\n[Context: Open Tabs]\n');
        for (const uri of openUris) {
          const relativePath = vscode.workspace.asRelativePath(uri);
          const isActive = activeUri && uri.toString() === activeUri.toString();
          const label = isActive ? `${relativePath} (active)` : relativePath;
          const content = await getDocumentText(uri);
          const trimmed = content.slice(0, MAX_FILE_CONTEXT_CHARS);
          appendContextChunk(
            contextState,
            `File: ${label}\nContent:\n\`\`\`\n${trimmed}\n\`\`\`\n`
          );
        }
      } else if (activeUri && activeUri.scheme === 'file') {
        const relativePath = vscode.workspace.asRelativePath(activeUri);
        const content = await getDocumentText(activeUri);
        const trimmed = content.slice(0, MAX_FILE_CONTEXT_CHARS);
        appendContextChunk(
          contextState,
          `\n[Context: Active File ${relativePath}]\nContent:\n\`\`\`\n${trimmed}\n\`\`\`\n`
        );
      }

      const terminals = vscode.window.terminals;
      if (terminals.length > 0) {
        const names = terminals.map(t => t.name).join(', ');
        appendContextChunk(contextState, `\n[Context: Terminals]\n${names}\n`);
      }
    }

    const fullContext = contextState.content;

    if (fullContext) {
      const message = shouldUseOpenTabs
        ? 'AIS Code: Using context from open tabs and workspace.'
        : 'AIS Code: Using explicit context and workspace.';
      vscode.window.showInformationMessage(message, { modal: false });
    } else if (!hasExplicitContext) {
      vscode.window.showWarningMessage('AIS Code: No context found (open tabs or explicit items).');
    }

    agent.updateSystemContext(summary, fullContext);
  } catch (e) {
    console.error('Failed to load context:', e);
  }

  deps.view?.webview.postMessage({ type: 'setStreaming', value: true });

  let promptText = text;
  const languageInstruction = '[IMPORTANT: Respond in the SAME LANGUAGE as the user input.]';
  const toolCallInstruction = '[ACTION: Provide a brief 1-sentence summary of fixes, then call <replace_in_file> or <write_file> IMMEDIATELY. NO MARKDOWN CODE BLOCKS.]';

  const fullContext = contextState.content;
  if (text.trim().startsWith('/fix')) {
    promptText = `${languageInstruction}\n${toolCallInstruction}\n[CRITICAL INSTRUCTION: Analyze the code below and fix it. Use tools directly.]\n\nCODE CONTEXT:\n${fullContext}\n\nUSER COMMAND: ${text}`;
  } else if (text.trim().startsWith('/explain')) {
    promptText = `${languageInstruction}\n[INSTRUCTION: Explain the code below.]\n\nCODE CONTEXT:\n${fullContext}\n\nUSER COMMAND: ${text}`;
  } else if (text.trim().startsWith('/test')) {
    promptText = `${languageInstruction}\n${toolCallInstruction}\n[INSTRUCTION: Write tests for the code below.]\n\nCODE CONTEXT:\n${fullContext}\n\nUSER COMMAND: ${text}`;
  }

  if (!fullContext && (text.includes('/') || text.length < 40)) {
    deps.view?.webview.postMessage({
      type: 'streamToken',
      text: '> [!CAUTION]\n> **AIS Code**: Не удалось найти активный файл. Пожалуйста, откройте файл или перетащите его в чат.'
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
