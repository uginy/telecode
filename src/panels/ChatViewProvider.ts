import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { applyPatch, parsePatch } from 'diff';
import { ProviderRegistry } from '../providers/registry';
import { Message } from '../providers/base';
import { FileSystemTools } from '../tools/fileSystem';
import { DiffContentProvider } from '../providers/diffProvider';
import { ChatStorage } from '../storage/ChatStorage';
import type { ApprovalRequest, WebviewMessage } from '../types/bridge';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aisCode.chatView';
  private static readonly maxProblemsChars = 8000;
  private static readonly maxTerminalChars = 8000;

  private _view?: vscode.WebviewView;
  private _messages: Message[] = [];
  private _conversationId: string;
  private _chatStorage: ChatStorage;
  private _didRestoreOnStartup = false;
  private _pendingApprovals = new Map<string, (approved: boolean) => void>();
  private _lastCommandOutput = '';
  private _fileIndex: Array<{ fsPath: string; relative: string; lower: string }> = [];
  private _indexReady = false;
  private _indexRebuildTimer?: NodeJS.Timeout;
  private _indexInFlight = false;
  private _lastStreamAppliedDiff?: string;

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

    // Restore last chat (or create a fresh one) once, when the webview is first created.
    // Don't await here to avoid blocking render.
    void this._restoreLastChatOnStartup();
    this._initializeWorkspaceIndexing();

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data: WebviewMessage) => {
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
          this._handleIndexingConfigChange();
          break;
        case 'fetchModels':
          await this._fetchModels(data.provider);
          break;
        case 'abortGeneration':
          this._abortGeneration();
          console.log('[ChatViewProvider] Aborting generation.');
          break;
        case 'newConversation':
          await this.newConversation();
          break;
        case 'runCommand':
          await this._handleRunCommand(data.command);
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
        case 'approvalResponse':
          this._handleApprovalResponse(data.requestId, data.decision);
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
      let errorCount = 0;
      let warningCount = 0;
      let infoCount = 0;
      let hintCount = 0;

      const problemStrings = diagnostics.map(([uri, diags]) => {
        if (diags.length === 0) return null;
        const filename = vscode.workspace.asRelativePath(uri);
        for (const diag of diags) {
          switch (diag.severity) {
            case vscode.DiagnosticSeverity.Error:
              errorCount++;
              break;
            case vscode.DiagnosticSeverity.Warning:
              warningCount++;
              break;
            case vscode.DiagnosticSeverity.Information:
              infoCount++;
              break;
            case vscode.DiagnosticSeverity.Hint:
              hintCount++;
              break;
          }
        }
        return `File: ${filename}\n` + diags.map(d => 
          `- [${vscode.DiagnosticSeverity[d.severity]}] Line ${d.range.start.line + 1}:${d.range.start.character + 1} ${d.message}`
        ).join('\n');
      }).filter(Boolean).join('\n\n');

      const summary = `Problems summary: ${errorCount} errors, ${warningCount} warnings, ${infoCount} info, ${hintCount} hints`;
      const content = problemStrings ? `${summary}\n\n${problemStrings}` : 'No problems found.';
      const trimmed = content.length > ChatViewProvider.maxProblemsChars
        ? content.slice(0, ChatViewProvider.maxProblemsChars) + '\n\n[Truncated]'
        : content;

      this._postMessage({
        type: 'contextAdded',
        context: {
          id: 'problems',
          name: 'Problems',
          content: trimmed,
          type: 'problems',
          path: 'problems'
        }
      });
    } else if (type === 'terminal') {
      const content = this._lastCommandOutput
        ? this._trimOutput(this._lastCommandOutput, ChatViewProvider.maxTerminalChars)
        : 'No terminal output captured yet. Use <run_command> in chat to execute a command and capture its output.';
      this._postMessage({
        type: 'contextAdded',
        context: {
          id: 'terminal',
          name: 'Terminal',
          content,
          type: 'terminal',
          path: 'terminal'
        }
      });
    }
  }

  private async _handleReviewDiff(code: string, language: string, targetPath?: string) {
    if (this._isUnifiedDiff(code)) {
      await this._previewBeforeApply(code, targetPath, true);
      return;
    }
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
      const isDiff = this._isUnifiedDiff(code);
      if (!this._isAutoApproveEnabled() && this._isDiffOnlyEnabled() && !isDiff) {
        throw new Error('Diff-only mode is enabled. Please provide a unified diff patch.');
      }
      if (!this._isAutoApproveEnabled()) {
        await this._previewBeforeApply(code, targetPath, isDiff);
      }
      if (isDiff) {
        await this._applyUnifiedDiff(code, targetPath);
        return;
      }

      const uri = await this._resolveExistingTarget(targetPath);
      const approved = await this._requestApproval({
        kind: 'apply',
        title: 'Apply changes',
        description: `Apply changes to ${path.basename(uri.fsPath)}?`,
        detail: 'This will replace file contents with the provided version.',
        path: uri.fsPath
      });
      if (!approved) {
        return;
      }

      const { doc, wasDirty } = await this._readDocument(uri);
      await this._writeDocument(doc, code, wasDirty);
      vscode.window.showInformationMessage(`Changes applied to ${path.basename(uri.fsPath)}`);
    } catch (error: any) {
      this._postMessage({ type: 'error', message: `Failed to apply changes: ${error.message}` });
      vscode.window.showErrorMessage(`Apply failed: ${error.message}`);
    }
  }

  private async _handleSearchContext(query: string, type?: string) {
    const items: any[] = [];
    const lowerQuery = query.toLowerCase();

    // 0. Open tabs
    if (!type || type === 'file') {
      const openEditors = vscode.window.visibleTextEditors
        .map((editor) => editor.document?.uri)
        .filter((uri): uri is vscode.Uri => !!uri && uri.scheme === 'file');

      const uniqueOpen = Array.from(new Map(openEditors.map((uri) => [uri.fsPath, uri])).values());
      for (const uri of uniqueOpen.slice(0, 10)) {
        const relativePath = vscode.workspace.asRelativePath(uri, false);
        const name = relativePath.split('/').pop() || relativePath;
        if (!lowerQuery || name.toLowerCase().includes(lowerQuery) || relativePath.toLowerCase().includes(lowerQuery)) {
          items.push({
            id: uri.fsPath,
            name,
            description: `Open tab • ${relativePath}`,
            type: 'file',
            path: uri.fsPath,
            icon: 'file-code'
          });
        }
      }
    }

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
        if (this._isIndexingEnabled() && this._indexReady) {
          const results = this._searchIndexedFiles(lowerQuery);
          for (const result of results) {
            items.push({
              id: result.fsPath,
              name: result.relative.split('/').pop() || result.relative,
              description: result.relative,
              type: 'file',
              path: result.fsPath,
              icon: 'file-code'
            });
          }
        } else {
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
    if (typeof config.autoApprove === 'boolean') {
      await wsConfig.update('autoApprove', config.autoApprove, vscode.ConfigurationTarget.Global);
    }
    if (typeof config.diffOnly === 'boolean') {
      await wsConfig.update('diffOnly', config.diffOnly, vscode.ConfigurationTarget.Global);
    }
    if (typeof config.workspaceIndex === 'boolean') {
      await wsConfig.update('workspaceIndex', config.workspaceIndex, vscode.ConfigurationTarget.Global);
    }
    if (typeof config.maxTokens === 'number') {
      await wsConfig.update('maxTokens', config.maxTokens, vscode.ConfigurationTarget.Global);
    }
    if (typeof config.temperature === 'number') {
      await wsConfig.update('temperature', config.temperature, vscode.ConfigurationTarget.Global);
    }
    
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
    return this._handleCreateChat();
  }

  private async _restoreLastChatOnStartup(): Promise<void> {
    if (this._didRestoreOnStartup) return;
    this._didRestoreOnStartup = true;

    try {
      const chats = await this._chatStorage.getAllChats();
      const latest = chats[0];

      if (latest) {
        const chat = await this._chatStorage.getChat(latest.id);
        if (chat) {
          this._conversationId = latest.id;
          this._messages = chat.messages;
          this._sendMessagesToWebview();
          this._postMessage({ type: 'chatLoaded', chatId: latest.id, messages: chat.messages });
          return;
        }
      }

      // No existing chats (or failed to load) -> start a fresh chat.
      await this._handleCreateChat();
    } catch (error: any) {
      this._log('Failed to restore chat on startup', error?.message ?? error);
      // Fallback to an in-memory conversation if storage fails.
      this._messages = [];
      this._conversationId = this._generateId();
      this._sendMessagesToWebview();
    }
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

    let finalContent = content.trim();
    if (!/Context:\s*```/i.test(finalContent)) {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document?.uri?.scheme === 'file') {
        const fileName = path.basename(editor.document.fileName);
        const fileContent = editor.document.getText();
        finalContent = `${finalContent}\n\nContext:\n\`\`\`file:${fileName}\n${fileContent}\n\`\`\``;
      }
    }

    // Add user message
    this._messages.push({ role: 'user', content: finalContent, timestamp: Date.now() });
    
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
      const suppressStreaming = this._isAutoApproveEnabled();
      let assistantIndex = -1;
      if (!suppressStreaming) {
        assistantIndex = this._messages.length;
        this._messages.push({ role: 'assistant', content: '', timestamp: Date.now() });
        this._postMessage({ 
          type: 'messageAdded', 
          message: this._messages[assistantIndex],
          isStreaming: true 
        });
      }

      let fullResponse = '';

      try {
        this._abortController = new AbortController();
        let streamAutoApplyInFlight = false;
        let streamAutoApplied = false;

        await provider.complete(this._messages.slice(0, -1), {
          onToken: (token) => {
            fullResponse += token;
            if (suppressStreaming && !streamAutoApplied && !streamAutoApplyInFlight) {
              streamAutoApplyInFlight = true;
              void this._tryStreamAutoApply(fullResponse).then((applied) => {
                if (applied) {
                  streamAutoApplied = true;
                }
              }).finally(() => {
                streamAutoApplyInFlight = false;
              });
            }
            if (!suppressStreaming && assistantIndex >= 0) {
              this._messages[assistantIndex].content = fullResponse;
              this._postMessage({
                type: 'streamToken',
                messageIndex: assistantIndex,
                token
              });
            }
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
        
        if (this._isAutoApproveEnabled() && !this._containsToolTags(fullResponse)) {
          const autoApplyResult = await this._maybeAutoApplyResponse(fullResponse);
          if (autoApplyResult) {
            if (autoApplyResult.applied) {
              if (assistantIndex >= 0) {
                this._messages.splice(assistantIndex, 1);
              }
            } else {
              if (assistantIndex >= 0) {
                this._messages[assistantIndex].content = autoApplyResult.message;
              } else {
                this._messages.push({
                  role: 'assistant',
                  content: autoApplyResult.message,
                  timestamp: Date.now()
                });
              }
            }
            this._postMessage({
              type: 'messages',
              messages: this._messages,
              conversationId: this._conversationId
            });
            break;
          }
        }

        const toolResult = await this._processToolCalls(fullResponse);
        
        if (toolResult) {
          const isErrorResult = /^Error:|^Denied/.test(toolResult);
          const followupRole = isErrorResult ? 'assistant' : 'user';
          const followupContent = isErrorResult
            ? toolResult
            : `Tool Execution Result:\n${toolResult}\n\nPlease continue based on this result.`;

          this._messages.push({
            role: followupRole,
            content: followupContent,
            timestamp: Date.now()
          });

          this._postMessage({
            type: 'messageAdded',
            message: this._messages[this._messages.length - 1]
          });

          if (isErrorResult) {
            break;
          }

          continue;
        } else {
          if (!suppressStreaming && assistantIndex >= 0) {
            this._messages[assistantIndex].content = fullResponse;
          } else if (suppressStreaming) {
            this._messages.push({
              role: 'assistant',
              content: fullResponse,
              timestamp: Date.now()
            });
          }
          this._postMessage({
            type: 'messages',
            messages: this._messages,
            conversationId: this._conversationId
          });
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

  private _containsToolTags(content: string): boolean {
    return /<read_file>|<list_files>|<write_file|<run_command>/s.test(content);
  }

  private async _tryStreamAutoApply(content: string): Promise<boolean> {
    const completedBlocks = this._extractCompletedCodeBlocks(content);
    if (completedBlocks.length === 0) {
      return false;
    }

    const diffBlock = completedBlocks.find((block) => this._isUnifiedDiff(block.content) || block.language === 'diff');
    if (diffBlock) {
      if (this._lastStreamAppliedDiff === diffBlock.content) {
        return false;
      }
      try {
        await this._handleApplyDiff(diffBlock.content);
        this._lastStreamAppliedDiff = diffBlock.content;
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  private async _maybeAutoApplyResponse(
    content: string
  ): Promise<{ applied: boolean; message: string } | null> {
    const blocks = this._extractCodeBlocks(content);
    if (blocks.length === 0) {
      return null;
    }

    const diffBlock = blocks.find((block) => this._isUnifiedDiff(block.content) || block.language === 'diff');
    if (diffBlock) {
      try {
        await this._handleApplyDiff(diffBlock.content);
        return { applied: true, message: '✅ Changes applied.' };
      } catch (error: any) {
        return { applied: false, message: `⚠️ Auto-apply failed: ${error.message}` };
      }
    }

    if (this._isDiffOnlyEnabled()) {
      return { applied: false, message: '⚠️ Auto-apply skipped: diff-only mode requires a unified diff.' };
    }

    const fileBlock = blocks.find((block) => block.language === 'file' || block.language === 'FILE');
    if (!fileBlock) {
      return null;
    }

    let targetPath = this._extractFilePathMarker(fileBlock.content);
    if (!targetPath) {
      targetPath = await this._extractTargetPathFromResponse(content);
    }
    if (!targetPath) {
      return { applied: false, message: '⚠️ Auto-apply skipped: missing file path marker.' };
    }

    try {
      await this._handleApplyDiff(fileBlock.content, targetPath);
      return { applied: true, message: '✅ Changes applied.' };
    } catch (error: any) {
      return { applied: false, message: `⚠️ Auto-apply failed: ${error.message}` };
    }
  }

  private _extractCodeBlocks(content: string): Array<{ language: string; content: string }> {
    const blocks: Array<{ language: string; content: string }> = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content))) {
      blocks.push({
        language: (match[1] || '').toLowerCase(),
        content: match[2].trim()
      });
    }
    return blocks;
  }

  private _extractCompletedCodeBlocks(content: string): Array<{ language: string; content: string }> {
    const blocks: Array<{ language: string; content: string }> = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content))) {
      blocks.push({
        language: (match[1] || '').toLowerCase(),
        content: match[2].trim()
      });
    }
    return blocks;
  }


  private _extractFilePathMarker(content: string): string | null {
    const lines = content.split('\n').slice(0, 5);
    for (const line of lines) {
      const single = line.match(/\/\/\s*file:\s*([^\s]+)/i);
      if (single) return single[1];
      const block = line.match(/\/\*\s*file:\s*([^\s]+)/i);
      if (block) return block[1];
      const plain = line.match(/file:\s*([^\s]+)/i);
      if (plain) return plain[1];
    }
    return null;
  }

  private async _extractTargetPathFromResponse(content: string): Promise<string | null> {
    const fileMarker = content.match(/file:\s*([^\s]+)/i);
    if (fileMarker?.[1]) {
      const resolved = await this._resolvePathIfExists(fileMarker[1]);
      if (resolved) return resolved;
    }

    const candidates = Array.from(
      new Set(
        (content.match(/[A-Za-z0-9._\-\\/]+\.[A-Za-z0-9]+/g) || [])
          .map((match) => match.trim())
          .slice(0, 6)
      )
    );

    for (const candidate of candidates) {
      const resolved = await this._resolvePathIfExists(candidate);
      if (resolved) return resolved;
    }

    return null;
  }

  private async _resolvePathIfExists(inputPath: string): Promise<string | null> {
    if (!inputPath) return null;
    try {
      if (path.isAbsolute(inputPath)) {
        const uri = vscode.Uri.file(inputPath);
        await vscode.workspace.fs.stat(uri);
        return uri.fsPath;
      }

      const files = await vscode.workspace.findFiles(inputPath, '**/{node_modules,.git,dist,out,build,coverage}/**', 1);
      if (files[0]) {
        return files[0].fsPath;
      }
    } catch {
      return null;
    }
    return null;
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
        temperature: config.get('temperature'),
        autoApprove: config.get('autoApprove'),
        diffOnly: config.get('diffOnly'),
        workspaceIndex: config.get('workspaceIndex')
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

  private _handleApprovalResponse(requestId: string, decision: 'approve' | 'deny') {
    const resolver = this._pendingApprovals.get(requestId);
    if (resolver) {
      this._pendingApprovals.delete(requestId);
      resolver(decision === 'approve');
    }
  }

  private _requestApproval(request: Omit<ApprovalRequest, 'requestId'>): Promise<boolean> {
    if (this._isAutoApproveEnabled()) {
      return Promise.resolve(true);
    }
    if (!this._view) {
      return Promise.resolve(false);
    }

    const requestId = this._generateId();
    const payload: ApprovalRequest = { requestId, ...request };

    this._postMessage({ type: 'approvalRequest', request: payload });

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this._pendingApprovals.delete(requestId);
        resolve(false);
      }, 60000);

      this._pendingApprovals.set(requestId, (approved) => {
        clearTimeout(timeout);
        resolve(approved);
      });
    });
  }

  private _isAutoApproveEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('aisCode');
    return config.get<boolean>('autoApprove') === true;
  }

  private _isDiffOnlyEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('aisCode');
    return config.get<boolean>('diffOnly') !== false;
  }

  private _isIndexingEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('aisCode');
    return config.get<boolean>('workspaceIndex') !== false;
  }

  private _resolveWorkspacePath(inputPath: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder open');
    }

    const uri = inputPath.startsWith('/')
      ? vscode.Uri.file(inputPath)
      : vscode.Uri.joinPath(workspaceFolders[0].uri, inputPath);

    // Only allow paths within an opened workspace folder.
    const wf = vscode.workspace.getWorkspaceFolder(uri);
    if (!wf) {
      throw new Error('Path is outside the current workspace');
    }

    return uri.fsPath;
  }

  private _initializeWorkspaceIndexing() {
    if (!this._isIndexingEnabled()) {
      return;
    }

    void this._buildWorkspaceIndex();

    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    watcher.onDidCreate(() => this._scheduleIndexRebuild());
    watcher.onDidDelete(() => this._scheduleIndexRebuild());
    watcher.onDidChange(() => this._scheduleIndexRebuild());
    this._context.subscriptions.push(watcher);
  }

  private _handleIndexingConfigChange() {
    if (this._isIndexingEnabled() && !this._indexReady && !this._indexInFlight) {
      void this._buildWorkspaceIndex();
    }
  }

  private _scheduleIndexRebuild() {
    if (!this._isIndexingEnabled()) {
      return;
    }
    if (this._indexRebuildTimer) {
      clearTimeout(this._indexRebuildTimer);
    }
    this._indexRebuildTimer = setTimeout(() => {
      void this._buildWorkspaceIndex();
    }, 1000);
  }

  private async _buildWorkspaceIndex() {
    if (this._indexInFlight) {
      return;
    }
    this._indexInFlight = true;
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        this._indexReady = false;
        return;
      }

      const files = await vscode.workspace.findFiles(
        '**/*',
        '**/{node_modules,.git,dist,out,build,coverage}/**',
        20000
      );
      this._fileIndex = files.map((file) => {
        const relative = vscode.workspace.asRelativePath(file, false);
        return {
          fsPath: file.fsPath,
          relative,
          lower: relative.toLowerCase()
        };
      });
      this._indexReady = true;
    } catch (error) {
      this._indexReady = false;
      this._log('Failed to build workspace index', error);
    } finally {
      this._indexInFlight = false;
    }
  }

  private _searchIndexedFiles(query: string) {
    if (!query) {
      return this._fileIndex.slice(0, 20);
    }
    const matches = this._fileIndex
      .map((entry) => {
        const idx = entry.lower.indexOf(query);
        if (idx === -1) return null;
        return { entry, idx };
      })
      .filter((item): item is { entry: { fsPath: string; relative: string; lower: string }; idx: number } => item !== null)
      .sort((a, b) => {
        if (a.idx !== b.idx) return a.idx - b.idx;
        return a.entry.relative.length - b.entry.relative.length;
      })
      .slice(0, 20)
      .map(({ entry }) => entry);

    return matches;
  }

  private async _previewBeforeApply(code: string, targetPath: string | undefined, isDiff: boolean) {
    if (!this._view) {
      return;
    }

    if (!isDiff) {
      await this._handleReviewDiff(code, 'text', targetPath);
      return;
    }

    const patches = parsePatch(code);
    if (patches.length !== 1) {
      this._postMessage({
        type: 'error',
        message: 'Preview supports single-file diffs only. Apply will still work for multi-file diffs.'
      });
      return;
    }

    const patch = patches[0];
    const patchPath = this._sanitizePatchPath(patch.newFileName) || this._sanitizePatchPath(patch.oldFileName);
    if (!patchPath) {
      return;
    }
    const uri = await this._resolveExistingTarget(targetPath ?? patchPath);
    const { text: current } = await this._readDocument(uri);
    const updated = applyPatch(current, patch, this._getApplyPatchOptions());
    if (updated === false) {
      this._postMessage({
        type: 'error',
        message: 'Diff preview failed: patch could not be applied to the current file content.'
      });
      return;
    }
    await this._handleReviewDiff(updated, 'text', uri.fsPath);
  }

  private async _resolveExistingTarget(targetPath?: string): Promise<vscode.Uri> {
    if (targetPath) {
      if (path.isAbsolute(targetPath)) {
        const uri = vscode.Uri.file(targetPath);
        await vscode.workspace.fs.stat(uri);
        return uri;
      }

      const files = await vscode.workspace.findFiles(targetPath, null, 2);
      if (files.length === 1) {
        return files[0];
      }
      if (files.length > 1) {
        throw new Error(`Multiple files match ${targetPath}. Please be more specific.`);
      }

      throw new Error(`File not found: ${targetPath}. Refusing to create new files.`);
    }

    if (vscode.window.activeTextEditor) {
      return vscode.window.activeTextEditor.document.uri;
    }

    throw new Error('No target file specified and no active editor');
  }

  private _isUnifiedDiff(content: string): boolean {
    return /^\s*diff --git/m.test(content) || (/^\s*---\s+/m.test(content) && /^\s*\+\+\+\s+/m.test(content));
  }

  private _sanitizePatchPath(patchPath?: string | null): string | null {
    if (!patchPath || patchPath === '/dev/null') {
      return null;
    }
    return patchPath.replace(/^[ab][\\/]/, '').replace(/\\/g, '/');
  }

  private async _applyUnifiedDiff(diffContent: string, targetPath?: string) {
    const patches = parsePatch(diffContent);
    if (patches.length === 0) {
      throw new Error('Diff is empty or invalid.');
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }

    const applySinglePatch = async (patch: ReturnType<typeof parsePatch>[number]) => {
      const patchPath = this._sanitizePatchPath(patch.newFileName) || this._sanitizePatchPath(patch.oldFileName);
      if (!patchPath) {
        throw new Error('Creating or deleting files via diff is not supported.');
      }
      const uri = await this._resolveExistingTarget(patchPath);
      const { doc, text: current, wasDirty } = await this._readDocument(uri);
      const updated = applyPatch(current, patch, this._getApplyPatchOptions());
      if (updated === false) {
        throw new Error(`Failed to apply diff to ${patchPath}. File might be out of date.`);
      }
      await this._writeDocument(doc, updated, wasDirty);
      return uri;
    };

    if (targetPath) {
      const resolved = await this._resolveExistingTarget(targetPath);
      const approved = await this._requestApproval({
        kind: 'apply',
        title: 'Apply diff',
        description: `Apply diff to ${path.basename(resolved.fsPath)}?`,
        detail: 'This will merge changes from a unified diff.',
        path: resolved.fsPath
      });
      if (!approved) return;

      const patchForTarget = patches.length === 1
        ? patches[0]
        : this._findPatchForTarget(patches, resolved);
      if (!patchForTarget) {
        throw new Error('Diff does not contain changes for the selected target file.');
      }
      const { doc, text: current, wasDirty } = await this._readDocument(resolved);
      const updated = applyPatch(current, patchForTarget, this._getApplyPatchOptions());
      if (updated === false) {
        throw new Error(`Failed to apply diff to ${targetPath}. File might be out of date.`);
      }
      await this._writeDocument(doc, updated, wasDirty);
      vscode.window.showInformationMessage(`Diff applied to ${path.basename(resolved.fsPath)}`);
      return;
    }

    const touched: string[] = [];
    for (const patch of patches) {
      const patchPath = this._sanitizePatchPath(patch.newFileName) || this._sanitizePatchPath(patch.oldFileName);
      if (!patchPath) {
        throw new Error('Creating or deleting files via diff is not supported.');
      }
      touched.push(patchPath);
    }

    const approved = await this._requestApproval({
      kind: 'apply',
      title: 'Apply diff',
      description: `Apply diff to ${patches.length} file(s)?`,
      detail: `Targets: ${touched.join(', ')}`,
      path: workspaceFolder.uri.fsPath
    });
    if (!approved) return;

    const applied: string[] = [];
    for (const patch of patches) {
      const uri = await applySinglePatch(patch);
      applied.push(path.basename(uri.fsPath));
    }
    if (touched.length > 0) {
      vscode.window.showInformationMessage(`Diff applied to ${applied.join(', ')}`);
    }
  }

  private _getApplyPatchOptions() {
    return {
      fuzzFactor: 2
    };
  }

  private async _readDocument(uri: vscode.Uri): Promise<{ doc: vscode.TextDocument; text: string; wasDirty: boolean }> {
    const doc = await vscode.workspace.openTextDocument(uri);
    return { doc, text: doc.getText(), wasDirty: doc.isDirty };
  }

  private async _writeDocument(doc: vscode.TextDocument, content: string, wasDirty: boolean) {
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      doc.positionAt(0),
      doc.positionAt(doc.getText().length)
    );
    edit.replace(doc.uri, fullRange, content);
    await vscode.workspace.applyEdit(edit);
    if (!wasDirty) {
      await doc.save();
    }
  }

  private _findPatchForTarget(
    patches: ReturnType<typeof parsePatch>,
    targetUri: vscode.Uri
  ): ReturnType<typeof parsePatch>[number] | undefined {
    const targetRel = vscode.workspace.asRelativePath(targetUri, false).replace(/\\/g, '/');
    const normalize = (value: string) => value.replace(/\\/g, '/').replace(/^\.\//, '');

    const exact = patches.find((patch) => {
      const patchPath = this._sanitizePatchPath(patch.newFileName) || this._sanitizePatchPath(patch.oldFileName);
      if (!patchPath) return false;
      return normalize(patchPath) === normalize(targetRel);
    });
    if (exact) return exact;

    const targetBase = path.posix.basename(targetRel);
    const baseMatches = patches.filter((patch) => {
      const patchPath = this._sanitizePatchPath(patch.newFileName) || this._sanitizePatchPath(patch.oldFileName);
      if (!patchPath) return false;
      const normalized = normalize(patchPath);
      return normalized === targetBase || normalized.endsWith(`/${targetBase}`);
    });

    return baseMatches.length === 1 ? baseMatches[0] : undefined;
  }

  private async _processToolCalls(response: string): Promise<string | null> {
    const readFileRegex = /<read_file>(.*?)<\/read_file>/s;
    const listFilesRegex = /<list_files>(.*?)<\/list_files>/s;
    const writeFileRegex = /<write_file\s+path="([^"]+)">(.*?)<\/write_file>/s;
    const runCommandRegex = /<run_command>(.*?)<\/run_command>/s;

    const readMatch = readFileRegex.exec(response);
    if (readMatch) {
      const path = readMatch[1].trim();
      if (!path) {
        return 'Error: <read_file> path is empty.';
      }
      try {
        const approved = await this._requestApproval({
          kind: 'read',
          title: 'Read file',
          description: `Allow AIS Code to read ${path}?`,
          path
        });
        if (!approved) {
          return `Denied reading file ${path}`;
        }

        const content = await FileSystemTools.readFile(this._resolveWorkspacePath(path));
        return `File content of ${path}:\n\`\`\`\n${content}\n\`\`\``;
      } catch (e: any) {
        return `Error reading file ${path}: ${e.message}`;
      }
    }

    const listMatch = listFilesRegex.exec(response);
    if (listMatch) {
      const path = listMatch[1].trim();
      if (!path) {
        return 'Error: <list_files> path is empty.';
      }
      try {
        const approved = await this._requestApproval({
          kind: 'list',
          title: 'List directory',
          description: `Allow AIS Code to list files in ${path}?`,
          path
        });
        if (!approved) {
          return `Denied listing directory ${path}`;
        }

        const files = await FileSystemTools.listFiles(this._resolveWorkspacePath(path));
        return `Files in ${path}:\n${files.join('\n')}`;
      } catch (e: any) {
        return `Error listing directory ${path}: ${e.message}`;
      }
    }

    const writeMatch = writeFileRegex.exec(response);
    if (writeMatch) {
      const path = writeMatch[1].trim();
      const content = writeMatch[2].trim();
      if (!path) {
        return 'Error: <write_file> path is empty.';
      }
      try {
         const approved = await this._requestApproval({
           kind: 'write',
           title: 'Write file',
           description: `Allow AIS Code to write ${path}?`,
           detail: `This will overwrite the file contents (${content.length} chars).`,
           path
         });
         if (!approved) {
           return `Denied writing file ${path}`;
         }

         await FileSystemTools.writeFile(this._resolveWorkspacePath(path), content);
         return `Successfully wrote to file ${path}`;
      } catch (e: any) {
        return `Error writing file ${path}: ${e.message}`;
      }
    }

    const commandMatch = runCommandRegex.exec(response);
    if (commandMatch) {
      const command = commandMatch[1].trim();
      if (!command) {
        return 'Error: <run_command> is empty.';
      }

      return this._runCommandWithApproval(command, 'tool');
    }

    return null;
  }

  private _trimOutput(content: string, maxChars: number): string {
    if (content.length <= maxChars) {
      return content;
    }
    return `${content.slice(0, maxChars)}\n\n[Truncated]`;
  }

  private _execCommand(command: string, cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number; signal?: string }> {
    return new Promise((resolve) => {
      exec(
        command,
        { cwd, timeout: 20000, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            const err: any = error;
            const exitCode = typeof err.code === 'number' ? err.code : 1;
            const signal = typeof err.signal === 'string' ? err.signal : undefined;
            resolve({ stdout, stderr, exitCode, signal });
            return;
          }
          resolve({ stdout, stderr, exitCode: 0 });
        }
      );
    });
  }

  private async _runCommandWithApproval(command: string, source: 'tool' | 'ui'): Promise<string> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return 'Error: No workspace folder open.';
    }

    const approved = await this._requestApproval({
      kind: 'command',
      title: 'Run command',
      description: source === 'ui' ? `Run command from chat: ${command}?` : `Allow AIS Code to run: ${command}?`,
      detail: `Working directory: ${workspaceFolder.uri.fsPath}`
    });
    if (!approved) {
      return `Denied running command: ${command}`;
    }

    const time = new Date().toISOString();
    try {
      const result = await this._execCommand(command, workspaceFolder.uri.fsPath);
      const combined = [result.stdout, result.stderr].filter(Boolean).join(result.stdout && result.stderr ? '\n\n' : '');
      const output = combined || '(no output)';
      const summary = `Command: ${command}\nTime: ${time}\nExit code: ${result.exitCode}${result.signal ? ` (${result.signal})` : ''}\n\n${output}`;
      this._lastCommandOutput = summary;
      return this._trimOutput(summary, ChatViewProvider.maxTerminalChars);
    } catch (e: any) {
      const summary = `Command: ${command}\nTime: ${time}\nExit code: 1\n\n${e.message}`;
      this._lastCommandOutput = summary;
      return this._trimOutput(summary, ChatViewProvider.maxTerminalChars);
    }
  }

  private async _handleRunCommand(command: string) {
    const trimmed = command.trim();
    if (!trimmed) {
      this._postMessage({ type: 'error', message: 'Command is empty.' });
      return;
    }

    const output = await this._runCommandWithApproval(trimmed, 'ui');
    const message: Message = {
      role: 'assistant',
      content: `\`\`\`terminal\n${output}\n\`\`\``,
      timestamp: Date.now()
    };

    this._messages.push(message);
    this._postMessage({ type: 'messageAdded', message });
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
