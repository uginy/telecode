import * as vscode from 'vscode';
import { AgentOrbit } from '../core/agent/AgentOrbit';
import { ToolRegistry } from '../core/tools/registry';
import { ReadFileTool, WriteFileTool, ListFilesTool, ReplaceInFileTool } from '../core/tools/implementations/FileSystem';
import { OpenRouterProvider } from '../core/providers/implementations/OpenRouter';
import { getWorkspaceSummary } from '../utils/workspace';
import { SessionManager } from '../core/session/SessionManager';
import { generateSessionSummaryPrompt } from '../core/prompts';

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

    webviewView.webview.onDidReceiveMessage(async (data: Record<string, unknown>) => {
      switch (data.type) {
        case 'sendMessage':
          await this._handleSendMessage(data.text as string);
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
    
    this._view.webview.postMessage({
      type: 'hydrateHistory',
      history
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

  private async _handleSendMessage(text: string) {
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

    // Inject Workspace & Active File Context (Update on every message)
    try {
       const summary = await getWorkspaceSummary();
       
       let activeFileContext = '';
       const editor = vscode.window.activeTextEditor;
       if (editor && editor.document.uri.scheme === 'file') {
          const filePath = editor.document.uri.fsPath;
          const relativePath = vscode.workspace.asRelativePath(filePath);
          const content = editor.document.getText();
          if (content.length < 100000) { // Limit to ~100KB
             activeFileContext = `Active File: ${relativePath}\nContent:\n\`\`\`\n${content}\n\`\`\``;
          }
       }

       this._agent.updateSystemContext(summary, activeFileContext);
    } catch (e) {
      console.error('Failed to load context:', e);
    }

    this._view?.webview.postMessage({ type: 'setStreaming', value: true });
    
    try {
      await this._agent.run(
        text, 
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
    const isDevelopment = this.context.extensionMode === vscode.ExtensionMode.Development;
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
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; script-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline';">
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
