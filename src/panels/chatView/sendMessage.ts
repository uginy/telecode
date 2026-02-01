import * as vscode from 'vscode';
import { AgentOrbit } from '../../core/agent/AgentOrbit';
import type { ToolRegistry } from '../../core/tools/registry';
import type { SessionManager } from '../../core/session/SessionManager';
import type { ProviderAdapter } from '../../core/providers/ProviderAdapter';
import { buildContext } from './contextBuilder';
import { inferIntent } from './intent';
import { getWorkspaceSummary } from '../../utils/workspace';
import type { Message as CoreMessage } from '../../core/types';

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
  type StatusKey =
    | 'thinking'
    | 'analyzing'
    | 'building_context'
    | 'searching_codebase'
    | 'running_tools';

  const postStatus = (status: StatusKey | null) => {
    deps.view?.webview.postMessage({ type: 'assistantStatus', status: status ? { key: status } : null });
  };

  let providerAdapter = await deps.createProviderAdapter();
  let intentResult = null as null | Awaited<ReturnType<typeof inferIntent>>;

  const config = vscode.workspace.getConfiguration('aisCode');
  const intentEnabled = config.get<boolean>('intentRouting.enabled') ?? true;

  if (providerAdapter && intentEnabled) {
    postStatus('analyzing');
    const intentModel = (config.get<string>('intentRouting.model') || '').trim();
    const intentOverrides = {
      maxTokens: config.get<number>('intentRouting.maxTokens') || 256,
      temperature: config.get<number>('intentRouting.temperature') ?? 0,
      ...(intentModel ? { modelId: intentModel } : {})
    };
    intentResult = await inferIntent(providerAdapter, text, intentOverrides);
  }

  const trimmedInput = text.trim();
  const intent = intentResult?.intent ?? 'general';
  const fileWriteIntentEn = /(?:^|\b)(create|write|save|update|add|generate|draft|compose|make)\b.*\b(file|doc(?:ument)?|readme|changelog|spec|report|plan|policy|license|notes|markdown|md)\b|\b(?:save|store|write)\b.*\b(file|doc(?:ument)?|readme|changelog|spec|report|plan|policy|license|notes|markdown|md)\b|\b[A-Za-z0-9_\-./\\]+\.(md|txt|json|yaml|yml)\b/i;
  const fileWriteIntentRu = /(?:созда[ййте]|сохрани|запиши|обнови|добавь|сделай|напис[аать]|сформируй|сгенерируй)[\s\S]*\b(файл|документ|доку|ридми|readme|спецификац|тз|отчет|план|инструкц|политик|лиценз|markdown|md)\b/i;
  const requiresFileWrite = fileWriteIntentEn.test(trimmedInput) || fileWriteIntentRu.test(trimmedInput);
  const codeEditIntentEn = /\b(fix|edit|update|modify|refactor|rename|replace|remove|delete|add|change|rewrite)\b/i;
  const codeEditIntentRu = /\b(исправь|пофикси|почини|обнови|измени|замени|удали|переименуй|рефактор|перепиши|добавь|замени)\b/i;
  const requiresCodeEdit = codeEditIntentEn.test(trimmedInput) || codeEditIntentRu.test(trimmedInput);
  const shouldAvoidTools =
    intent === 'project_overview' ||
    (intent === 'general' && !intentResult?.requireCodeContext && trimmedInput.length <= 80 && !requiresFileWrite);

  const runDirectCompletion = async (options: { includeWorkspaceSummary: boolean }) => {
    if (!providerAdapter) return false;
    const activeSession = deps.sessionManager.activeSession;
    const activeSessionId = deps.sessionManager.activeSessionId;
    const history = activeSession?.messages ?? [];
    const userMessage: CoreMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    };

    let workspaceSummary = '';
    if (options.includeWorkspaceSummary) {
      postStatus('building_context');
      workspaceSummary = await getWorkspaceSummary();
    }

    const systemPrompt = `
You are AIS Code, an expert coding assistant inside VS Code.
Always respond in the SAME LANGUAGE as the user.
DO NOT call tools. Respond directly.
If the information is missing, ask one short clarifying question.
`.trim();

    const userContent = options.includeWorkspaceSummary
      ? `WORKSPACE SUMMARY:\n${workspaceSummary}\n\nUSER QUESTION:\n${text}`
      : text;

    const messages: CoreMessage[] = [
      { id: 'direct-system', role: 'system', content: systemPrompt, timestamp: Date.now() },
      ...history,
      { id: 'direct-user', role: 'user', content: userContent, timestamp: Date.now() }
    ];

    postStatus('thinking');
    deps.view?.webview.postMessage({ type: 'setStreaming', value: true });

    let fullContent = '';
    try {
      const response = await providerAdapter.complete(messages, { stream: true });
      if (typeof response === 'string') {
        fullContent = response;
        deps.view?.webview.postMessage({ type: 'streamToken', text: fullContent });
      } else {
        for await (const chunk of response) {
          fullContent += chunk;
          deps.view?.webview.postMessage({ type: 'streamToken', text: chunk });
        }
      }

      const assistantMessage: CoreMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullContent,
        timestamp: Date.now()
      };

      if (activeSessionId) {
        const merged = [...history, userMessage, assistantMessage];
        await deps.sessionManager.saveMessages(activeSessionId, merged);
        deps.view?.webview.postMessage({
          type: 'updateSessionList',
          sessions: deps.sessionManager.sessions,
          activeSessionId: deps.sessionManager.activeSessionId
        });
        deps.getAgent()?.setHistory(merged);
      }
    } catch (error: unknown) {
      const e = error as Error;
      deps.view?.webview.postMessage({ type: 'streamToken', text: `\n\n**Error**: ${e.message || 'Unknown error occurred'}` });
      console.error('Direct completion error:', e);
    } finally {
      deps.view?.webview.postMessage({ type: 'setStreaming', value: false });
      postStatus(null);
      await deps.saveHistory();
    }

    return true;
  };

  if (shouldAvoidTools) {
    const handled = await runDirectCompletion({ includeWorkspaceSummary: intent === 'project_overview' });
    if (handled) return;
  }

  if (!deps.getAgent()) {
    if (!providerAdapter) {
      providerAdapter = await deps.createProviderAdapter();
    }
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
      lastActiveEditor: deps.lastActiveEditor,
      strategy: intentResult?.strategy,
      onProgress: (status) => postStatus(status)
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

  postStatus('thinking');
  deps.view?.webview.postMessage({ type: 'setStreaming', value: true });

  let promptText = text;
  const languageInstruction = '[IMPORTANT: Respond in the SAME LANGUAGE as the user input.]';
  const toolCallInstruction = '[ACTION: Provide a brief 1-sentence summary of fixes, then call <replace_in_file> or <write_file> IMMEDIATELY. NO MARKDOWN CODE BLOCKS.]';
  const fileWriteInstruction = '[FILE WRITE REQUIRED: The user asked to create or save a document/file. Provide a 1-sentence summary, then call <write_file path="..."> immediately. Do NOT output the full document in chat. If the filename is not specified, choose a clear Markdown filename in the project root.]';

  if (text.trim().startsWith('/fix')) {
    promptText = `${languageInstruction}\n${toolCallInstruction}\n[CRITICAL INSTRUCTION: Analyze the code below and fix it. Use tools directly.]\n\nCODE CONTEXT:\n${fullContext}\n\nUSER COMMAND: ${text}`;
  } else if (text.trim().startsWith('/explain')) {
    promptText = `${languageInstruction}\n[INSTRUCTION: Explain the code below.]\n\nCODE CONTEXT:\n${fullContext}\n\nUSER COMMAND: ${text}`;
  } else if (text.trim().startsWith('/test')) {
    promptText = `${languageInstruction}\n${toolCallInstruction}\n[INSTRUCTION: Write tests for the code below.]\n\nCODE CONTEXT:\n${fullContext}\n\nUSER COMMAND: ${text}`;
  } else if (requiresFileWrite) {
    promptText = `${languageInstruction}\n${fileWriteInstruction}\n\nUSER COMMAND: ${text}`;
  }

  const trimmedCommand = text.trim();
  const needsFileContext =
    trimmedCommand.startsWith('/fix') ||
    trimmedCommand.startsWith('/test') ||
    trimmedCommand.startsWith('/explain') ||
    !!intentResult?.requireCodeContext;

  const hasLikelyFileMention = /(?:^|[\s"`'([{])([A-Za-z0-9_\-./\\]+?\.[A-Za-z0-9]{1,6}|README(?:\.md)?)(?=$|[\s"'`)\]}.,:;!?])/i.test(text);

  if (!fullContext && needsFileContext && !hasLikelyFileMention) {
    postStatus(null);
    deps.view?.webview.postMessage({
      type: 'streamToken',
      text: '> [!CAUTION]\n> **AIS Code**: Не удалось найти активный файл. Откройте файл или добавьте контекст через @.'
    });
  }

  const forceTools =
    text.trim().startsWith('/fix') ||
    text.trim().startsWith('/test') ||
    requiresFileWrite ||
    requiresCodeEdit;

  const runAgentOnce = async (input: string) => {
    let toolCallsSeen = false;
    let writeToolSeen = false;
    await agent.run(
      input,
      (chunk: string) => {
        deps.view?.webview.postMessage({ type: 'streamToken', text: chunk });
      },
      (result: { toolCallId: string; output: string; isError: boolean }) => {
        deps.view?.webview.postMessage({ type: 'toolResult', result });
      },
      (status) => postStatus(status as StatusKey),
      (calls) => {
        toolCallsSeen = toolCallsSeen || (calls?.length ?? 0) > 0;
        if (calls && calls.length > 0) {
          for (const call of calls) {
            if (call?.name === 'write_file' || call?.name === 'replace_in_file') {
              writeToolSeen = true;
            }
          }
        }
        deps.view?.webview.postMessage({ type: 'toolCalls', calls });
      }
    );
    return { toolCallsSeen, writeToolSeen };
  };

  try {
    const firstRun = await runAgentOnce(promptText);
    if ((!firstRun.toolCallsSeen || !firstRun.writeToolSeen) && forceTools) {
      const correctivePrompt = `${languageInstruction}\n[CRITICAL: You must apply file changes now. Use <write_file> / <replace_in_file> as needed. Respond ONLY with tool calls.]\n${fullContext ? `CODE CONTEXT:\\n${fullContext}\\n\\n` : ''}USER COMMAND: ${text}`;
      await runAgentOnce(correctivePrompt);
    }

    const usage = agent.getUsage();
    deps.view?.webview.postMessage({ type: 'updateUsage', usage });
  } catch (error: unknown) {
    const e = error as Error;
    postStatus(null);
    deps.view?.webview.postMessage({ type: 'streamToken', text: `\n\n**Error**: ${e.message || 'Unknown error occurred'}` });
    console.error('Chat execution error:', e);
  } finally {
    deps.view?.webview.postMessage({ type: 'setStreaming', value: false });
    postStatus(null);
    await deps.saveHistory();
  }
}
