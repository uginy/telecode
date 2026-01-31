import * as vscode from 'vscode';
import { AgentOrbit } from '../core/agent/AgentOrbit';
import { ToolRegistry } from '../core/tools/registry';
import { ReadFileTool, WriteFileTool, ListFilesTool, ReplaceInFileTool } from '../core/tools/implementations/FileSystem';
import { SearchFilesTool } from '../core/tools/implementations/Search';
import { RunCommandTool } from '../core/tools/implementations/Terminal';
import { GetProblemsTool } from '../core/tools/implementations/Lsp';
import { ProviderRegistry } from '../providers/registry';
import { ProviderAdapter } from '../core/providers/ProviderAdapter';
import { BaseProvider } from '../providers/base';
import { getWorkspaceSummary } from '../utils/workspace';
import { SessionManager } from '../core/session/SessionManager';
import { generateSessionSummaryPrompt } from '../core/prompts';

import * as path from 'node:path';
import { EditManager } from '../core/edits/EditManager';
import { DiffContentProvider } from '../core/edits/DiffContentProvider';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _agent?: AgentOrbit;
  private _toolRegistry: ToolRegistry;
  private _sessionManager: SessionManager;
  private _lastActiveEditor: vscode.TextEditor | undefined;
  private _providerRegistry: ProviderRegistry;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri
  ) {
    this._toolRegistry = new ToolRegistry();
    this._toolRegistry.register(new ReadFileTool());
    this._toolRegistry.register(new WriteFileTool());
    this._toolRegistry.register(new ReplaceInFileTool());
    this._toolRegistry.register(new ListFilesTool());
    this._toolRegistry.register(new SearchFilesTool());
    this._toolRegistry.register(new RunCommandTool());
    this._toolRegistry.register(new GetProblemsTool());
    
    this._sessionManager = new SessionManager(context);
    this._providerRegistry = new ProviderRegistry();
    
    // Track the last active text editor to maintain context when focus shifts to Webview
    this._lastActiveEditor = vscode.window.activeTextEditor;
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            this._lastActiveEditor = editor;
        }
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Subscribe to EditManager events
    EditManager.getInstance().onDidProposeEdit((edit) => {
        this._view?.webview.postMessage({
            type: 'toolApprovalRequest',
            edit: {
                id: edit.id,
                filePath: edit.filePath,
                description: edit.description,
                timestamp: edit.timestamp
            }
        });
    });

    webviewView.webview.onDidReceiveMessage(async (data: Record<string, unknown>) => {
      switch (data.type) {
        case 'sendMessage':
          await this._handleSendMessage(data.text as string, data.contextItems as { type: string, value: string }[]);
          break;
        case 'stop':
            if (this._agent) {
                this._agent.stop();
                this._view?.webview.postMessage({ type: 'setStreaming', value: false });
            }
            break;
        case 'editApproval': {
            const approvalData = data as { id: string, approved: boolean };
            if (approvalData.approved) {
                try {
                    const result = await EditManager.getInstance().applyEdit(approvalData.id);
                    vscode.window.showInformationMessage(result);
                } catch (e: unknown) {
                     const error = e as Error;
                     vscode.window.showErrorMessage(`Failed to apply edit: ${error.message}`);
                }
            } else {
                EditManager.getInstance().rejectEdit(approvalData.id);
                vscode.window.showInformationMessage('Edit rejected.');
            }
            break;
        }
        case 'openDiff': {
            const diffId = data.id as string;
            const edit = EditManager.getInstance().getEdit(diffId);
            if (edit) {
                const originalUri = vscode.Uri.file(edit.filePath);
                const modifiedUri = vscode.Uri.parse(`${DiffContentProvider.scheme}:${edit.filePath}?id=${diffId}`);
                
                await vscode.commands.executeCommand('vscode.diff', 
                    originalUri, 
                    modifiedUri, 
                    `Diff: ${path.basename(edit.filePath)} (Proposed)`
                );
            } else {
                vscode.window.showErrorMessage('Edit expired or not found.');
            }
            break;
        }
        case 'clearHistory':
          await this._handleClearHistory();
          break;
        case 'updateSettings':
          await this._handleUpdateSettings(data.settings as Record<string, unknown>);
          break;
        case 'webviewLoaded':
          this._updateWebviewSettings();
          await this._sessionManager.init(); // Ensure we are ready
          await this._hydrateHistory();
          await this._sendSessionList();
          break;
        case 'createSession':
          await this._handleCreateSession();
          break;
        case 'loadSession':
          await this._handleLoadSession(data.sessionId as string);
          break;
        case 'deleteSession':
          await this._handleDeleteSession(data.sessionId as string);
          break;
        case 'searchFiles':
          await this._handleSearchFiles(data.query as string);
          break;
        case 'resolveContextItems':
          await this._handleResolveContextItems(data.paths as string[]);
          break;
      }
    });

    // Handle configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('aisCode')) {
        this._updateWebviewSettings();
      }
    });

    // Initial settings sync
    this._updateWebviewSettings();
  }

  private _updateWebviewSettings() {
    if (!this._view) return;
    const config = vscode.workspace.getConfiguration('aisCode');
    const provider = config.get<string>('provider') || 'openrouter';

    const providerSettings = this._getProviderSettings(provider, config);
    this._view.webview.postMessage({
      type: 'setSettings',
      settings: {
        provider,
        modelId: providerSettings.modelId,
        apiKey: providerSettings.apiKey,
        maxTokens: config.get('maxTokens') || 4096,
        temperature: config.get('temperature') || 0.7,
        autoApprove: config.get('autoApprove') ?? true,
      }
    });
  }

  private async _handleUpdateSettings(settings: Record<string, unknown>) {
    const config = vscode.workspace.getConfiguration('aisCode');
    const provider = (settings.provider as string | undefined) || config.get<string>('provider') || 'openrouter';
    
    // Update global settings
    if (settings.provider) await config.update('provider', settings.provider, vscode.ConfigurationTarget.Global);
    if (settings.maxTokens) await config.update('maxTokens', settings.maxTokens, vscode.ConfigurationTarget.Global);
    if (settings.temperature) await config.update('temperature', settings.temperature, vscode.ConfigurationTarget.Global);
    if (settings.autoApprove !== undefined) await config.update('autoApprove', settings.autoApprove, vscode.ConfigurationTarget.Global);
    
    // Update provider specific settings
    if (provider === 'openrouter') {
      if (settings.modelId) await config.update('openrouter.model', settings.modelId, vscode.ConfigurationTarget.Global);
      if (settings.apiKey !== undefined) await config.update('openrouter.apiKey', settings.apiKey, vscode.ConfigurationTarget.Global);
    } else if (provider === 'openai') {
      if (settings.modelId) await config.update('openai.model', settings.modelId, vscode.ConfigurationTarget.Global);
      if (settings.apiKey !== undefined) await config.update('openai.apiKey', settings.apiKey, vscode.ConfigurationTarget.Global);
    } else if (provider === 'anthropic') {
      if (settings.modelId) await config.update('anthropic.model', settings.modelId, vscode.ConfigurationTarget.Global);
      if (settings.apiKey !== undefined) await config.update('anthropic.apiKey', settings.apiKey, vscode.ConfigurationTarget.Global);
    } else if (provider === 'openai-compatible') {
      if (settings.modelId) await config.update('openaiCompatible.model', settings.modelId, vscode.ConfigurationTarget.Global);
      if (settings.apiKey !== undefined) await config.update('openaiCompatible.apiKey', settings.apiKey, vscode.ConfigurationTarget.Global);
    }

    vscode.window.showInformationMessage('AIS Code: Settings updated');
    
    // Force agent re-initialization on next message
    this._agent = undefined;
  }

  private _getProviderSettings(provider: string, config: vscode.WorkspaceConfiguration) {
    if (provider === 'openai') {
      return {
        modelId: config.get('openai.model') || 'gpt-4o',
        apiKey: config.get('openai.apiKey') || ''
      };
    }
    if (provider === 'anthropic') {
      return {
        modelId: config.get('anthropic.model') || 'claude-sonnet-4-20250514',
        apiKey: config.get('anthropic.apiKey') || ''
      };
    }
    if (provider === 'openai-compatible') {
      return {
        modelId: config.get('openaiCompatible.model') || 'llama3.2',
        apiKey: config.get('openaiCompatible.apiKey') || ''
      };
    }
    return {
      modelId: config.get('openrouter.model') || 'google/gemini-2.0-flash-exp:free',
      apiKey: config.get('openrouter.apiKey') || ''
    };
  }

  private async _createProviderAdapter(): Promise<ProviderAdapter | null> {
    const config = vscode.workspace.getConfiguration('aisCode');
    const providerName = config.get<string>('provider') || 'openrouter';
    const provider = await this._providerRegistry.getProvider(providerName);

    if (!provider) {
      this._view?.webview.postMessage({
        type: 'streamToken',
        text: `**AIS Code**: Provider "${providerName}" is not configured. Add an API key in Settings.`
      });
      return null;
    }

    return new ProviderAdapter(provider as BaseProvider);
  }

  private async _hydrateHistory() {
    if (!this._view) return;
    
    // Ensure we have an active session, if not create one
    if (!this._sessionManager.activeSessionId && this._sessionManager.sessions.length === 0) {
      await this._sessionManager.createSession('New Chat');
    } else if (!this._sessionManager.activeSessionId && this._sessionManager.sessions.length > 0) {
      // Set first available as active
      await this._sessionManager.setActiveSession(this._sessionManager.sessions[0].id);
    }

    const history = this._sessionManager.activeSession?.messages || [];
    
    // Pre-process history to attach tool results to assistant messages for the UI logic
    const processedHistory = history.map((msg, index) => {
        if (msg.role === 'assistant') {
            const toolResults: { toolCallId: string, output: string, isError: boolean }[] = [];
            let i = index + 1;
            while (i < history.length && history[i].role === 'tool') {
                const toolMsg = history[i];
                if (toolMsg.toolResult) {
                    toolResults.push(toolMsg.toolResult);
                } else {
                     // Fallback for legacy/missing structure
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
    
    this._view.webview.postMessage({
      type: 'hydrateHistory',
      history: processedHistory
    });
  }

  private async _handleClearHistory() {
    if (this._sessionManager.activeSessionId) {
        await this._sessionManager.saveMessages(this._sessionManager.activeSessionId, []);
        this._agent = undefined; // Force context reload
        await this._hydrateHistory();
    }
  }
  
  private async _sendSessionList() {
    if (!this._view) return;
    this._view.webview.postMessage({
      type: 'updateSessionList',
      sessions: this._sessionManager.sessions,
      activeSessionId: this._sessionManager.activeSessionId
    });
  }

  private async _saveHistory() {
    if (!this._agent) return;
    const messages = this._agent.getMessages();
    const activeId = this._sessionManager.activeSessionId;
    if (activeId) {
       await this._sessionManager.saveMessages(activeId, messages);
       await this._sendSessionList(); // Update list to show new timestamp
       
       // Trigger summarization if needed
       this._checkAndSummarize(activeId, messages);
    }
  }

  private async _checkAndSummarize(sessionId: string, messages: { role: string; content: string }[]) {
    const session = await this._sessionManager.getSession(sessionId);
    if (!session || session.title !== 'New Chat') return;

    // Summarize after we have at least user message and assistant response (so length >= 2 typically, excluding system)
    const contentMessages = messages.filter(m => m.role !== 'system');
    if (contentMessages.length >= 2 && contentMessages.length <= 4) {
      this._summarizeTitle(sessionId, contentMessages);
    }
  }


  private async _summarizeTitle(sessionId: string, messages: { role: string; content: string }[]) {
      try {
        const providerAdapter = await this._createProviderAdapter();
        if (!providerAdapter) return;

        // Map messages to simpler format
        const promptMessages = messages.map(m => ({ 
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
            await this._sessionManager.updateSession(sessionId, { title });
            await this._sendSessionList();
        }
      } catch (e) {
          console.error('Failed to summarize title:', e);
      }
  }

  private async _handleCreateSession() {
    const session = await this._sessionManager.createSession();
    this._agent = undefined; // clear agent
    await this._hydrateHistory();
    await this._sendSessionList();
  }

  private async _handleLoadSession(sessionId: string) {
    if (this._sessionManager.activeSessionId === sessionId) return;
    
    await this._sessionManager.setActiveSession(sessionId);
    this._agent = undefined; // clear agent to reload context
    await this._hydrateHistory();
    await this._sendSessionList();
  }

  private async _handleDeleteSession(sessionId: string) {
    await this._sessionManager.deleteSession(sessionId);
    // If active was deleted, _hydrateHistory (called next) will pick a new one or create fresh
    if (!this._sessionManager.activeSessionId) {
        this._agent = undefined;
        await this._hydrateHistory();
    }
    await this._sendSessionList();
  }

  private async _handleSearchFiles(query: string) {
    if (!this._view) return;
    
    const results: { type: 'file' | 'folder' | 'terminal', label: string, value: string }[] = [];

    // 1. Files
    const pattern = query ? `**/*${query}*` : '**/*'; 
    const exclude = '{**/node_modules/**,**/dist/**,**/.git/**,**/out/**,**/build/**}';
    
    try {
        const files = await vscode.workspace.findFiles(pattern, exclude, 15);
        results.push(...files.map(uri => ({
            type: 'file' as const,
            label: vscode.workspace.asRelativePath(uri),
            value: vscode.workspace.asRelativePath(uri)
        })));

        // 2. Folders (Workspace roots match)
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                if (!query || folder.name.toLowerCase().includes(query.toLowerCase())) {
                    results.push({
                        type: 'folder' as const,
                        label: folder.name, 
                        value: folder.uri.fsPath 
                    });
                }
            }
        }

        // 3. Terminals
        const terminals = vscode.window.terminals;
        for (const term of terminals) {
            if (!query || term.name.toLowerCase().includes(query.toLowerCase())) {
                results.push({
                    type: 'terminal' as const,
                    label: term.name,
                    value: term.name // unique enough for this session
                });
            }
        }
        
        this._view.webview.postMessage({
            type: 'searchResults',
            results
        });
    } catch (e) {
        console.error('Search files error:', e);
        this._view.webview.postMessage({ type: 'searchResults', results: [] });
    }
  }

  private async _handleResolveContextItems(paths: string[]) {
    if (!this._view) return;
    const items: { type: 'file' | 'folder' | 'terminal', label: string, value: string }[] = [];
    
    for (const p of paths) {
        try {
            // Check if path is valid uri
            // If it's a file path string from VS Code drag event, it likely is file:///...
            // If it's just a path, Uri.file might be needed. 
            // We'll try parse first, if scheme is 'file', good.
            let uri = vscode.Uri.parse(p);
            
            // If parse didn't give a scheme, maybe it's a raw path
            if (uri.scheme !== 'file' && !p.startsWith('file:')) {
                uri = vscode.Uri.file(p);
            }
            
            const stat = await vscode.workspace.fs.stat(uri);
            const relativePath = vscode.workspace.asRelativePath(uri);
            
            if (stat.type === vscode.FileType.Directory) {
                 items.push({ type: 'folder', label: relativePath, value: uri.fsPath });
            } else {
                 items.push({ type: 'file', label: relativePath, value: relativePath });
            }
        } catch (e) {
            console.warn('Failed to resolve path:', p, e);
        }
    }
    
    this._view.webview.postMessage({
        type: 'addContextItems',
        items
    });
  }

  private async _handleSendMessage(text: string, contextItems?: { type: string, value: string }[]) {
    if (!this._agent) {
      const providerAdapter = await this._createProviderAdapter();
      if (!providerAdapter) {
        return;
      }

      this._agent = new AgentOrbit(providerAdapter, this._toolRegistry);

      // Load History from Active Session
      const history = this._sessionManager.activeSession?.messages || [];
      if (history.length > 0) {
        this._agent.setHistory(history);
      }
    }

    let fullContext = '';

    // Inject Workspace & Active File & Explicit Context
    try {
       const summary = await getWorkspaceSummary();

       // 1. Active File (Fallback to last active if focus is in Chat)
       let editor = vscode.window.activeTextEditor || this._lastActiveEditor;
       
       // Fallback to visible editors if needed
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
          contextFileName = path.basename(filePath);
          const content = editor.document.getText();
          if (content.length < 100000) { 
             fullContext += `\n[Context: Active File ${relativePath}]\nContent:\n\`\`\`\n${content}\n\`\`\`\n`;
          }
       }

       if (contextFileName) {
           vscode.window.showInformationMessage(`AIS Code: Analyzing ${contextFileName}...`, { modal: false });
       } else {
           vscode.window.showWarningMessage(`AIS Code: No active file context found!`);
       }

       // 2. Explicit Context Items
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

       this._agent.updateSystemContext(summary, fullContext);
    } catch (e) {
      console.error('Failed to load context:', e);
    }

    this._view?.webview.postMessage({ type: 'setStreaming', value: true });
    
    // Slash Command Pre-processing
    let promptText = text;
    const languageInstruction = "[IMPORTANT: Respond in the SAME LANGUAGE as the user input.]";
    const toolCallInstruction = "[ACTION: Provide a brief 1-sentence summary of fixes, then call <replace_in_file> or <write_file> IMMEDIATELY. NO MARKDOWN CODE BLOCKS.]";
    
    if (text.trim().startsWith('/fix')) {
        promptText = `${languageInstruction}\n${toolCallInstruction}\n[CRITICAL INSTRUCTION: Analyze the code below and fix it. Use tools directly.]\n\nCODE CONTEXT:\n${fullContext}\n\nUSER COMMAND: ${text}`;
    } else if (text.trim().startsWith('/explain')) {
        promptText = `${languageInstruction}\n[INSTRUCTION: Explain the code below.]\n\nCODE CONTEXT:\n${fullContext}\n\nUSER COMMAND: ${text}`;
    } else if (text.trim().startsWith('/test')) {
         promptText = `${languageInstruction}\n${toolCallInstruction}\n[INSTRUCTION: Write tests for the code below.]\n\nCODE CONTEXT:\n${fullContext}\n\nUSER COMMAND: ${text}`;
    }

    if (!fullContext && (text.includes('/') || text.length < 40)) {
        this._view?.webview.postMessage({ 
            type: 'streamToken', 
            text: '> [!CAUTION]\n> **AIS Code**: Не удалось найти активный файл. Пожалуйста, откройте файл или перетащите его в чат.' 
        });
    }

    try {
      await this._agent.run(
        promptText, 
        (chunk: string) => {
          this._view?.webview.postMessage({ type: 'streamToken', text: chunk });
        },
        (result: { toolCallId: string, output: string, isError: boolean }) => {
          this._view?.webview.postMessage({ type: 'toolResult', result });
        }
      );
      
      // Update usage after each run
      const usage = this._agent.getUsage();
      this._view?.webview.postMessage({ type: 'updateUsage', usage });
    } catch (error: unknown) {
      const e = error as Error;
      this._view?.webview.postMessage({ type: 'streamToken', text: `\n\n**Error**: ${e.message || 'Unknown error occurred'}` });
      console.error('Chat execution error:', e);
    } finally {
      this._view?.webview.postMessage({ type: 'setStreaming', value: false });
      await this._saveHistory();
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const isDevelopment = false; // FORCE PRODUCTION MODE: Fixes blank screen when Vite server is not running. 
    // const isDevelopment = this.context.extensionMode === vscode.ExtensionMode.Development;
    const devServerUrl = 'http://localhost:5173';

    if (isDevelopment) {
      return `<!DOCTYPE html>
        <html lang="en" class="dark">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; script-src 'unsafe-eval' 'unsafe-inline' ${devServerUrl}; style-src 'unsafe-inline' ${devServerUrl}; connect-src ${devServerUrl} ws://localhost:5173 http://localhost:5173; font-src ${devServerUrl}; frame-src ${devServerUrl};">
          <title>AIS Code (Dev)</title>
          <script type="module">
            import { injectIntoGlobalHook } from "${devServerUrl}/@react-refresh";
            injectIntoGlobalHook(window);
            window.$RefreshReg$ = () => {};
            window.$RefreshSig$ = () => (type) => type;
            window.__vite_plugin_react_preamble_installed__ = true;
          </script>
          <script type="module" src="${devServerUrl}/@vite/client"></script>
        </head>
        <body>
          <div id="root"></div>
          <script type="module" src="${devServerUrl}/src/main.tsx"></script>
          <script>
            const vscode = acquireVsCodeApi();
            window.vscode = vscode;
          </script>
        </body>
        </html>`;
    }

    const distPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'index.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'index.css'));

    return `<!DOCTYPE html>
      <html lang="en" class="dark">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; script-src ${webview.cspSource} 'unsafe-inline'; style-src ${webview.cspSource} 'unsafe-inline';">
        <link href="${styleUri}" rel="stylesheet">
        <title>AIS Code</title>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="${scriptUri}"></script>
        <script>
          const vscode = acquireVsCodeApi();
          window.vscode = vscode;
        </script>
      </body>
      </html>`;
  }
}
