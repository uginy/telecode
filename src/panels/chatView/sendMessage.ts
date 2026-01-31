import * as vscode from 'vscode';
import { AgentOrbit } from '../../core/agent/AgentOrbit';
import type { ToolRegistry } from '../../core/tools/registry';
import type { SessionManager } from '../../core/session/SessionManager';
import type { ProviderAdapter } from '../../core/providers/ProviderAdapter';
import { getWorkspaceSummary } from '../../utils/workspace';

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
    const summary = await getWorkspaceSummary();

    let editor = vscode.window.activeTextEditor || deps.lastActiveEditor;

    if (!editor || editor.document.uri.scheme !== 'file') {
      const visibleFileEditor = vscode.window.visibleTextEditors.find(e => e.document.uri.scheme === 'file');
      if (visibleFileEditor) {
        editor = visibleFileEditor;
      }
    }

    let contextFileName = '';
    if (editor && editor.document.uri.scheme === 'file') {
      const filePath = editor.document.uri.fsPath;
      const relativePath = vscode.workspace.asRelativePath(filePath);
      contextFileName = filePath.split(/[/\\]/).pop() || '';
      const content = editor.document.getText();
      if (content.length < 100000) {
        fullContext += `\n[Context: Active File ${relativePath}]\nContent:\n\`\`\`\n${content}\n\`\`\`\n`;
      }
    }

    if (contextFileName) {
      vscode.window.showInformationMessage(`AIS Code: Analyzing ${contextFileName}...`, { modal: false });
    } else {
      vscode.window.showWarningMessage('AIS Code: No active file context found!');
    }

    if (contextItems && contextItems.length > 0) {
      fullContext += `\n[Explicit Context Items]\n`;
      for (const item of contextItems) {
        try {
          if (item.type === 'file') {
            const uris = await vscode.workspace.findFiles(item.value, null, 1);
            if (uris.length > 0) {
              const fileBytes = await vscode.workspace.fs.readFile(uris[0]);
              const content = new TextDecoder().decode(fileBytes);
              fullContext += `File: ${item.value}\nContent:\n\`\`\`\n${content}\n\`\`\`\n`;
            }
          }
        } catch (e) {
          console.warn(`Failed to read context item ${item.value}:`, e);
        }
      }
    }

    agent.updateSystemContext(summary, fullContext);
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
