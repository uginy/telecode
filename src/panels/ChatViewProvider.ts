import * as vscode from 'vscode';
import * as path from 'path';
import { ProviderRegistry } from '../providers/registry';
import { Message, StreamCallbacks } from '../providers/base';
import { FileSystemTools } from '../tools/fileSystem';
import { DiffContentProvider } from '../providers/diffProvider';
import { ChatStorage, ChatMetadata } from '../storage/ChatStorage';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aisCode.chatView';

  private _view?: vscode.WebviewView;
  private _messages: Message[] = [];
  private _conversationId: string;
  private _chatStorage: ChatStorage;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _providerRegistry: ProviderRegistry,
    private readonly _diffContentProvider: DiffContentProvider,
    private readonly _context: vscode.ExtensionContext,
    private readonly _outputChannel?: vscode.OutputChannel
  ) {
    this._conversationId = this._generateId();
    this._chatStorage = new ChatStorage(_context);
    this._log('ChatViewProvider initialized');
  }

  private _log(message: string, ...args: any[]) {
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] ${message}`;
    if (this._outputChannel) {
       this._outputChannel.appendLine(formatted + (args.length ? ' ' + JSON.stringify(args) : ''));
    }
    console.log(formatted, ...args);
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
      this._log(`Received message from webview: ${data.type}`, data);
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
          console.log('[ChatViewProvider] Aborting generation.');
          break;
        case 'newConversation':
          this.newConversation();
          break;
        case 'getContext':
          this._handleGetContext();
          break;
        case 'searchContext':
          console.log('[ChatViewProvider] Handling searchContext query:', data.query, 'contextType:', data.contextType);
          this._handleSearchContext(data.query, data.contextType);
          break;
        case 'requestContextItem':
          this._handleRequestContextItem(data.path, data.contextType);
          break;
        case 'reviewDiff':
          this._handleReviewDiff(data.code, data.language, data.targetPath);
          break;
        case 'applyDiff':
          await this._handleApplyDiff(data.code, data.targetPath);
          break;
        case 'loadHistory':
          await this._handleLoadHistory();
          break;
        case 'loadChat':
          await this._handleLoadChat(data.chatId);
          break;
        case 'saveChat':
          await this._handleSaveChat(data.chatId, data.messages);
          break;
        case 'deleteChat':
          await this._handleDeleteChat(data.chatId);
          break;
        case 'createChat':
          await this._handleCreateChat();
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

  private async _handleRequestContextItem(itemPath: string, type: 'file' | 'folder' | 'terminal' | 'problems') {
    if (type === 'file') {
      try {
        const uri = vscode.Uri.file(itemPath);
        // Try to get from open document first
        const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === uri.fsPath);
        let content = '';

        if (doc) {
          content = doc.getText();
        } else {
          const uint8Array = await vscode.workspace.fs.readFile(uri);
          content = new TextDecoder().decode(uint8Array);
        }

        this._postMessage({
          type: 'contextAdded',
          context: {
            id: itemPath,
            name: uri.path.split('/').pop() || itemPath,
            content,
            type: 'file',
            path: itemPath
          }
        });
      } catch (error: any) {
        this._postMessage({
          type: 'error',
          message: `Failed to read file: ${error.message}`
        });
      }
    } else if (type === 'problems') {
      const diagnostics = vscode.languages.getDiagnostics();
      const problemStrings = diagnostics.map(([uri, diags]) => {
        if (diags.length === 0) return null;
        const filename = vscode.workspace.asRelativePath(uri);
        return `File: ${filename}\n` + diags.map(d => 
          `- [${vscode.DiagnosticSeverity[d.severity]}] Line ${d.range.start.line + 1}: ${d.message}`
        ).join('\n');
      }).filter(Boolean).join('\n\n');

      this._postMessage({
        type: 'contextAdded',
        context: {
          id: 'problems',
          name: 'Problems',
          content: problemStrings || 'No problems found.',
          type: 'problems',
          path: 'problems'
        }
      });
    } else if (type === 'terminal') {
       this._postMessage({
          type: 'contextAdded',
          context: {
            id: 'terminal',
            name: 'Terminal',
            content: 'Terminal output reading is not yet supported in this version.',
            type: 'terminal',
            path: 'terminal'
          }
        });
    }
  }

  private async _handleReviewDiff(code: string, language: string, targetPath?: string) {
    let uri: vscode.Uri;
    
    if (targetPath) {
      // Find the file
      if (path.isAbsolute(targetPath)) {
        uri = vscode.Uri.file(targetPath);
      } else {
        const files = await vscode.workspace.findFiles(targetPath, null, 1);
        if (files[0]) uri = files[0];
        else uri = vscode.Uri.file(vscode.workspace.workspaceFolders![0].uri.fsPath + '/' + targetPath);
      }
    } else {
       if (vscode.window.activeTextEditor) {
         uri = vscode.window.activeTextEditor.document.uri;
       } else {
         this._postMessage({ type: 'error', message: "No active file to apply changes to. Please specify a path or open a file." });
         return;
       }
    }

    const virtualUri = vscode.Uri.parse(`ais-diff://${uri.path}?proposed`);
    this._diffContentProvider.updateContent(virtualUri, code);

    await vscode.commands.executeCommand('vscode.diff',
       uri,
       virtualUri,
       `Diff: ${uri.path.split('/').pop()} (Original) ↔ Proposed`
    );
  }

  private async _handleApplyDiff(code: string, targetPath?: string) {
    try {
      let uri: vscode.Uri;

      if (targetPath) {
        if (path.isAbsolute(targetPath)) {
          uri = vscode.Uri.file(targetPath);
        } else {
          const files = await vscode.workspace.findFiles(targetPath, null, 1);
          if (files[0]) {
            uri = files[0];
          } else {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
              throw new Error('No workspace folder open');
            }
            uri = vscode.Uri.joinPath(workspaceFolder.uri, targetPath);
          }
        }
      } else {
        if (vscode.window.activeTextEditor) {
          uri = vscode.window.activeTextEditor.document.uri;
        } else {
          throw new Error('No target file specified and no active editor');
        }
      }

      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(code));
      vscode.window.showInformationMessage(`Changes applied to ${path.basename(uri.fsPath)}`);
    } catch (error: any) {
      this._postMessage({ type: 'error', message: `Failed to apply changes: ${error.message}` });
      vscode.window.showErrorMessage(`Apply failed: ${error.message}`);
    }
  }

  private async _handleSearchContext(query: string, type?: string) {
    const items: any[] = [];
    const lowerQuery = query.toLowerCase();

    // 1. Static items (Terminal, Problems)
    if (!type || type === 'terminal') {
      if ('terminal'.includes(lowerQuery)) {
        items.push({
          id: 'terminal',
          name: 'Terminal Output',
          description: 'Last used terminal content',
          type: 'terminal',
          path: 'terminal',
          icon: 'terminal'
        });
      }
    }

    if (!type || type === 'problems') {
      if ('problems'.includes(lowerQuery)) {
        items.push({
          id: 'problems',
          name: 'Problems',
          description: 'Current workspace errors and warnings',
          type: 'problems',
          path: 'problems',
          icon: 'error'
        });
      }
    }

    // 2. File search
    if (!type || type === 'file') {
      try {
        // Find files matching query, exclude node_modules, .git, etc.
        // Limit to 20 results for performance
        const files = await vscode.workspace.findFiles(`**/*${query}*`, '**/{node_modules,.git,dist,out,build}/**', 20);
        
        for (const file of files) {
          const workspaceFolder = vscode.workspace.getWorkspaceFolder(file);
          const relativePath = workspaceFolder ? vscode.workspace.asRelativePath(file, false) : file.fsPath;
          
          items.push({
            id: file.fsPath,
            name: relativePath.split('/').pop() || relativePath,
            description: relativePath,
            type: 'file',
            path: file.fsPath,
            icon: 'file-code'
          });
        }
      } catch (e) {
        console.error('Error searching files:', e);
      }
    }

    this._postMessage({
      type: 'searchContextResults',
      items
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

  private async _handleLoadHistory() {
    try {
      const chats = await this._chatStorage.getAllChats();
      this._postMessage({ type: 'historyLoaded', chats });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to load history: ${error.message}`);
      this._postMessage({ type: 'error', message: error.message });
    }
  }

  private async _handleLoadChat(chatId: string) {
    try {
      const chat = await this._chatStorage.getChat(chatId);
      if (chat) {
        this._conversationId = chatId;
        this._messages = chat.messages;
        this._sendMessagesToWebview();
        this._postMessage({ type: 'chatLoaded', chatId, messages: chat.messages });
      } else {
        this._postMessage({ type: 'error', message: 'Chat not found' });
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to load chat: ${error.message}`);
      this._postMessage({ type: 'error', message: error.message });
    }
  }

  private async _handleSaveChat(chatId: string, messages: Message[]) {
    try {
      const metadata = await this._chatStorage.saveChat(chatId, messages);
      this._postMessage({ type: 'chatSaved', metadata });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to save chat: ${error.message}`);
      this._postMessage({ type: 'error', message: error.message });
    }
  }

  private async _handleDeleteChat(chatId: string) {
    try {
      await this._chatStorage.deleteChat(chatId);
      if (this._conversationId === chatId) {
        this._messages = [];
        this._conversationId = this._generateId();
        this._sendMessagesToWebview();
      }
      this._postMessage({ type: 'chatDeleted', chatId });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to delete chat: ${error.message}`);
      this._postMessage({ type: 'error', message: error.message });
    }
  }

  private async _handleCreateChat() {
    try {
      const metadata = await this._chatStorage.createChat();
      this._conversationId = metadata.id;
      this._messages = [];
      this._sendMessagesToWebview();
      this._postMessage({ type: 'chatCreated', metadata });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to create chat: ${error.message}`);
      this._postMessage({ type: 'error', message: error.message });
    }
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
    this._messages.push({ role: 'user', content: content.trim(), timestamp: Date.now() });
    
    // Notify webview
    this._postMessage({ 
      type: 'messageAdded', 
      message: this._messages[this._messages.length - 1] 
    });

    const providerName = vscode.workspace.getConfiguration('aisCode').get<string>('provider');
    const provider = await this._providerRegistry.getProvider(providerName || 'openai-compatible');

    if (!provider) {
      this._postMessage({ type: 'error', message: `Provider ${providerName} not found` });
      return;
    }

    if (!provider.isConfigured()) {
      this._postMessage({ type: 'error', message: 'Provider not configured. Please check settings.' });
      return;
    }

    let loopCount = 0;
    const maxLoops = 5;

    while (loopCount < maxLoops) {
      loopCount++;
      const userMessageIndex = this._messages.length;
      
      this._messages.push({ role: 'assistant', content: '', timestamp: Date.now() });

      this._postMessage({ 
        type: 'messageAdded', 
        message: this._messages[userMessageIndex],
        isStreaming: true 
      });

      let fullResponse = '';

      try {
        this._abortController = new AbortController();

        await provider.complete(this._messages.slice(0, -1), {
          onToken: (token) => {
            fullResponse += token;
            this._messages[userMessageIndex].content = fullResponse;
            this._postMessage({
              type: 'streamToken',
              messageIndex: userMessageIndex,
              token
            });
          },
          onComplete: (response) => {
            fullResponse = response;
          },
          onError: (error) => {
            throw error;
          },
          signal: this._abortController.signal
        });

        this._postMessage({ type: 'streamComplete' });
        
        const toolResult = await this._processToolCalls(fullResponse);
        
        if (toolResult) {
          this._messages.push({ 
            role: 'user', 
            content: `Tool Execution Result:\n${toolResult}\n\nPlease continue based on this result.`,
            timestamp: Date.now()
          });
          
          this._postMessage({
             type: 'messageAdded',
             message: this._messages[this._messages.length - 1]
          });
          
          continue; 
        } else {
          break;
        }

      } catch (error: any) {
        if (error.name === 'AbortError') {
          return;
        }
        vscode.window.showErrorMessage(`AI Error: ${error.message}`);
        this._postMessage({ type: 'error', message: error.message });
        
        if (!fullResponse) {
          this._messages.pop();
        }
        break;
      } finally {
        this._abortController = undefined;
      }
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

  private _postMessage(message: any) {
    this._log(`Posting message to webview: ${message.type}`);
    this._view?.webview.postMessage(message);
  }

  private _generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private async _processToolCalls(response: string): Promise<string | null> {
    const readFileRegex = /<read_file>(.*?)<\/read_file>/s;
    const listFilesRegex = /<list_files>(.*?)<\/list_files>/s;
    const writeFileRegex = /<write_file\s+path="([^"]+)">(.*?)<\/write_file>/s;

    const readMatch = readFileRegex.exec(response);
    if (readMatch) {
      const path = readMatch[1].trim();
      try {
        const content = await FileSystemTools.readFile(this._resolvePath(path));
        return `File content of ${path}:\n\`\`\`\n${content}\n\`\`\``;
      } catch (e: any) {
        return `Error reading file ${path}: ${e.message}`;
      }
    }

    const listMatch = listFilesRegex.exec(response);
    if (listMatch) {
      const path = listMatch[1].trim();
      try {
        const files = await FileSystemTools.listFiles(this._resolvePath(path));
        return `Files in ${path}:\n${files.join('\n')}`;
      } catch (e: any) {
        return `Error listing directory ${path}: ${e.message}`;
      }
    }

    const writeMatch = writeFileRegex.exec(response);
    if (writeMatch) {
      const path = writeMatch[1].trim();
      const content = writeMatch[2].trim();
      try {
         await FileSystemTools.writeFile(this._resolvePath(path), content);
         return `Successfully wrote to file ${path}`;
      } catch (e: any) {
        return `Error writing file ${path}: ${e.message}`;
      }
    }

    return null;
  }

  private _resolvePath(path: string): string {
    if (path.startsWith('/')) return path; // Absolute
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return path; // No workspace, assume absolute or fail
    return vscode.Uri.joinPath(workspaceFolders[0].uri, path).fsPath;
  }

  private _handleGetContext() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const selection = editor.selection;
      const text = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
      console.log('[ChatViewProvider] Getting context from active editor. Selection empty:', selection.isEmpty);
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
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
