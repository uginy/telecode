import * as vscode from 'vscode';
import { AgentOrbit } from '../core/agent/AgentOrbit';
import { ToolRegistry } from '../core/tools/registry';
import { ReadFileTool, WriteFileTool, ListFilesTool, ReplaceInFileTool } from '../core/tools/implementations/FileSystem';
import { SearchFilesTool } from '../core/tools/implementations/Search';
import { RunCommandTool } from '../core/tools/implementations/Terminal';
import { GetProblemsTool } from '../core/tools/implementations/Lsp';
import { OpenRouterProvider } from '../core/providers/implementations/OpenRouter';
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
          await this._handleSendMessage(data.text as string, data.contextItems as string[]);
          break;
        case 'stop':
            if (this._agent) {
                this._agent.stop();
                this._view?.webview.postMessage({ type: 'setStreaming', value: false });
            }
            break;
        case 'editApproval':
            const approvalData = data as { id: string, approved: boolean };
            if (approvalData.approved) {
                try {
                    const result = await EditManager.getInstance().applyEdit(approvalData.id);
                    vscode.window.showInformationMessage(result);
                } catch (e: any) {
                     vscode.window.showErrorMessage(`Failed to apply edit: ${e.message}`);
                }
            } else {
                EditManager.getInstance().rejectEdit(approvalData.id);
                vscode.window.showInformationMessage('Edit rejected.');
            }
            break;
        case 'openDiff':
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
        case 'clearHistory':
          this._handleClearHistory();
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
    this._view.webview.postMessage({
      type: 'setSettings',
      settings: {
        provider: config.get('provider') || 'openrouter',
        modelId: config.get('openrouter.model') || 'google/gemini-2.0-flash-exp:free',
        apiKey: config.get('openrouter.apiKey') || '',
        maxTokens: config.get('maxTokens') || 4096,
        temperature: config.get('temperature') || 0.7,
        autoApprove: config.get('autoApprove') ?? true,
      }
    });
  }

  private async _handleUpdateSettings(settings: Record<string, unknown>) {
    const config = vscode.workspace.getConfiguration('aisCode');
    
    // Update global settings
    if (settings.provider) await config.update('provider', settings.provider, vscode.ConfigurationTarget.Global);
    if (settings.maxTokens) await config.update('maxTokens', settings.maxTokens, vscode.ConfigurationTarget.Global);
    if (settings.temperature) await config.update('temperature', settings.temperature, vscode.ConfigurationTarget.Global);
    if (settings.autoApprove !== undefined) await config.update('autoApprove', settings.autoApprove, vscode.ConfigurationTarget.Global);
    
    // Update provider specific settings
    if (settings.provider === 'openrouter') {
      if (settings.modelId) await config.update('openrouter.model', settings.modelId, vscode.ConfigurationTarget.Global);
      if (settings.apiKey !== undefined) await config.update('openrouter.apiKey', settings.apiKey, vscode.ConfigurationTarget.Global);
    }

    vscode.window.showInformationMessage('AIS Code: Settings updated');
    
    // Force agent re-initialization on next message
    this._agent = undefined;
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
            const toolResults: any[] = [];
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

  private async _checkAndSummarize(sessionId: string, messages: any[]) {
    const session = await this._sessionManager.getSession(sessionId);
    if (!session || session.title !== 'New Chat') return;

    // Summarize after we have at least user message and assistant response (so length >= 2 typically, excluding system)
    const contentMessages = messages.filter(m => m.role !== 'system');
    if (contentMessages.length >= 2 && contentMessages.length <= 4) {
      this._summarizeTitle(sessionId, contentMessages);
    }
  }


  private async _summarizeTitle(sessionId: string, messages: any[]) {
      try {
        const config = vscode.workspace.getConfiguration('aisCode');
        const provider = new OpenRouterProvider({
          provider: 'openrouter',
          apiKey: config.get('openrouter.apiKey') || '',
          modelId: config.get('openrouter.model') || 'google/gemini-2.0-flash-exp:free', // Use same model
          maxTokens: 50, // Short output
          temperature: 0.5
        });

        // Map messages to simpler format
        const promptMessages = messages.map(m => ({ 
            role: m.role, 
            content: m.content 
        }));
        
        const prompt = generateSessionSummaryPrompt(promptMessages);

        const response = await provider.complete([
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
      const config = vscode.workspace.getConfiguration('aisCode');
      const apiKey = config.get<string>('openrouter.apiKey') || '';
      const modelId = config.get<string>('openrouter.model') || 'google/gemini-2.0-flash-exp:free';

      const provider = new OpenRouterProvider({
        provider: 'openrouter',
        apiKey: apiKey,
        modelId: modelId,
        maxTokens: config.get<number>('maxTokens'),
        temperature: config.get<number>('temperature')
      });

      this._agent = new AgentOrbit(provider, this._toolRegistry);

      // Load History from Active Session
      const history = this._sessionManager.activeSession?.messages || [];
      if (history.length > 0) {
        this._agent.setHistory(history);
      }
    }

    // Inject Workspace & Active File & Explicit Context
    try {
       const summary = await getWorkspaceSummary();
       
       let fullContext = '';

       // 1. Active File
       const editor = vscode.window.activeTextEditor;
       if (editor && editor.document.uri.scheme === 'file') {
          const filePath = editor.document.uri.fsPath;
          const relativePath = vscode.workspace.asRelativePath(filePath);
          const content = editor.document.getText();
          if (content.length < 100000) { 
             fullContext += `\n[Active File: ${relativePath}]\nContent:\n\`\`\`\n${content}\n\`\`\`\n`;
          }
       }

       // 2. Explicit Context Items
       if (contextItems && contextItems.length > 0) {
           fullContext += `\n[Explicit Context Items]\n`;
           for (const item of contextItems) {
               try {
                   if (item.type === 'file') {
                       // Search for the file uri by relative path - verify it exists
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
    if (text.trim().startsWith('/fix')) {
        promptText = `[INSTRUCTION: The user invoked /fix. Analyze the Active File content in the context above for bugs, logical errors, or potential issues. Propose and apply fixes using 'replace_in_file' if applicable.]\n\n${text}`;
    } else if (text.trim().startsWith('/explain')) {
        promptText = `[INSTRUCTION: The user invoked /explain. Explain the Active File content in the context above. Describe its purpose, key functions, and logic.]\n\n${text}`;
    } else if (text.trim().startsWith('/test')) {
         promptText = `[INSTRUCTION: The user invoked /test. Generate comprehensive unit tests for the Active File content in the context above. Use 'write_file' to create a new test file if appropriate.]\n\n${text}`;
    }

    try {
      await this._agent.run(
        promptText, 
        (chunk: string) => {
          this._view?.webview.postMessage({ type: 'streamToken', text: chunk });
        },
        (result) => {
          this._view?.webview.postMessage({ type: 'toolResult', result });
        }
      );
      
      // Update usage after each run
      const usage = this._agent.getUsage();
      this._view?.webview.postMessage({ type: 'updateUsage', usage });
    } catch (error: any) {
      this._view?.webview.postMessage({ type: 'streamToken', text: `\n\n**Error**: ${error.message || 'Unknown error occurred'}` });
      console.error('Chat execution error:', error);
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
