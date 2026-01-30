import * as vscode from 'vscode';
import { ProviderRegistry } from '../providers/registry';
import { Message, StreamCallbacks } from '../providers/base';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aisCode.chatView';

  private _view?: vscode.WebviewView;
  private _messages: Message[] = [];
  private _conversationId: string;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _providerRegistry: ProviderRegistry
  ) {
    this._conversationId = this._generateId();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview')
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'sendMessage':
          await this._handleUserMessage(data.content);
          break;
        case 'getMessages':
          this._sendMessagesToWebview();
          break;
        case 'getConfig':
          this._sendConfigToWebview();
          break;
        case 'saveConfig':
          await this._saveConfig(data.config);
          this._sendConfigToWebview();
          break;
        case 'fetchModels':
          await this._fetchModels(data.provider);
          break;
        case 'abortGeneration':
          this._abortGeneration();
          break;
        case 'newConversation':
          this.newConversation();
          break;
        case 'getContext':
          this._handleGetContext();
          break;
      }
    });

    // Send initial data when view is shown
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._sendMessagesToWebview();
        this._sendConfigToWebview();
      }
    });
  }

  private async _saveConfig(config: any) {
    const wsConfig = vscode.workspace.getConfiguration('aisCode');
    await wsConfig.update('provider', config.provider, vscode.ConfigurationTarget.Global);
    
    if (config.provider === 'openrouter') {
      if (config.apiKey) await wsConfig.update('openrouter.apiKey', config.apiKey, vscode.ConfigurationTarget.Global);
      if (config.model) await wsConfig.update('openrouter.model', config.model, vscode.ConfigurationTarget.Global);
    } else if (config.provider === 'openai-compatible') {
      if (config.baseUrl) await wsConfig.update('openaiCompatible.baseUrl', config.baseUrl, vscode.ConfigurationTarget.Global);
      if (config.apiKey) await wsConfig.update('openaiCompatible.apiKey', config.apiKey, vscode.ConfigurationTarget.Global);
      if (config.model) await wsConfig.update('openaiCompatible.model', config.model, vscode.ConfigurationTarget.Global);
    } else if (config.provider === 'anthropic') {
      if (config.apiKey) await wsConfig.update('anthropic.apiKey', config.apiKey, vscode.ConfigurationTarget.Global);
      if (config.model) await wsConfig.update('anthropic.model', config.model, vscode.ConfigurationTarget.Global);
    } else if (config.provider === 'openai') {
      if (config.apiKey) await wsConfig.update('openai.apiKey', config.apiKey, vscode.ConfigurationTarget.Global);
      if (config.model) await wsConfig.update('openai.model', config.model, vscode.ConfigurationTarget.Global);
    }
  }

  private async _fetchModels(providerName: string) {
    const provider = await this._providerRegistry.getProvider(providerName);
    if (provider && 'fetchModels' in provider) {
      try {
        const models = await (provider as any).fetchModels();
        this._postMessage({
          type: 'modelsFound',
          provider: providerName,
          models
        });
      } catch (error: any) {
        this._postMessage({
          type: 'error',
          message: `Failed to fetch models: ${error.message}`
        });
      }
    }
  }

  public newConversation() {
    this._messages = [];
    this._conversationId = this._generateId();
    this._sendMessagesToWebview();
    this._postMessage({ type: 'conversationCleared' });
  }

  public updateConfiguration() {
    this._sendConfigToWebview();
  }

  private _abortController?: AbortController;

  private _abortGeneration() {
    this._abortController?.abort();
    this._abortController = undefined;
  }

  private async _handleUserMessage(content: string) {
    if (!content.trim()) return;

    // Add user message
    const userMessage: Message = {
      role: 'user',
      content: content.trim(),
      timestamp: Date.now()
    };
    this._messages.push(userMessage);
    this._postMessage({ type: 'messageAdded', message: userMessage });

    // Create assistant message placeholder
    const assistantMessage: Message = {
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    };
    this._messages.push(assistantMessage);
    this._postMessage({ type: 'messageAdded', message: assistantMessage, isStreaming: true });

    try {
      // Get the current provider
      const config = vscode.workspace.getConfiguration('aisCode');
      const providerName = config.get<string>('provider') || 'anthropic';
      const provider = await this._providerRegistry.getProvider(providerName);

      if (!provider) {
        throw new Error(`Provider ${providerName} not configured`);
      }

      // Create abort controller
      this._abortController = new AbortController();

      // Stream the response
      const callbacks: StreamCallbacks = {
        onToken: (token: string) => {
          assistantMessage.content += token;
          this._postMessage({
            type: 'streamToken',
            token,
            messageIndex: this._messages.length - 1
          });
        },
        onComplete: (fullResponse: string) => {
          assistantMessage.content = fullResponse;
          this._postMessage({
            type: 'streamComplete',
            messageIndex: this._messages.length - 1
          });
        },
        onError: (error: Error) => {
          this._postMessage({
            type: 'error',
            message: error.message
          });
        },
        signal: this._abortController.signal
      };

      await provider.complete(this._messages, callbacks);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({
        type: 'error',
        message: errorMessage
      });
      
      // Remove the empty assistant message on error
      if (assistantMessage.content === '') {
        this._messages.pop();
      }
    } finally {
      this._abortController = undefined;
    }
  }

  private _sendMessagesToWebview() {
    this._postMessage({
      type: 'messages',
      messages: this._messages,
      conversationId: this._conversationId
    });
  }

  private _sendConfigToWebview() {
    const config = vscode.workspace.getConfiguration('aisCode');
    const provider = config.get<string>('provider') || 'openai-compatible';
    
    let baseUrl = '';
    let apiKey = '';
    
    if (provider === 'openai-compatible') {
      baseUrl = config.get('openaiCompatible.baseUrl') || '';
      apiKey = config.get('openaiCompatible.apiKey') || '';
    } else if (provider === 'openrouter') {
      apiKey = config.get('openrouter.apiKey') || '';
    } else if (provider === 'anthropic') {
      apiKey = config.get('anthropic.apiKey') || '';
    } else if (provider === 'openai') {
      apiKey = config.get('openai.apiKey') || '';
    }

    this._postMessage({
      type: 'config',
      config: {
        provider,
        model: this._getCurrentModel(config),
        baseUrl,
        apiKey,
        maxTokens: config.get('maxTokens'),
        temperature: config.get('temperature')
      }
    });
  }

  private _getCurrentModel(config: vscode.WorkspaceConfiguration): string {
    const provider = config.get<string>('provider') || 'openai-compatible';
    switch (provider) {
      case 'openrouter':
        return config.get('openrouter.model') || 'google/gemini-2.0-flash-exp:free';
      case 'openai-compatible':
        return config.get('openaiCompatible.model') || 'llama3.2';
      case 'anthropic':
        return config.get('anthropic.model') || 'claude-sonnet-4-20250514';
      case 'openai':
        return config.get('openai.model') || 'gpt-4o';
      default:
        return 'unknown';
    }
  }

  private _postMessage(message: unknown) {
    this._view?.webview.postMessage(message);
  }

  private _generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private _handleGetContext() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const selection = editor.selection;
      const text = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
      const fileName = editor.document.fileName.split('/').pop() || 'Untitled';
      
      this._postMessage({
        type: 'contextAdded',
        context: {
          id: Date.now().toString(),
          name: fileName,
          content: text,
          type: 'file',
          path: editor.document.fileName
        }
      });
    } else {
      vscode.window.showInformationMessage('No active editor found');
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'index.css')
    );

    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>AIS Code Chat</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private _getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
