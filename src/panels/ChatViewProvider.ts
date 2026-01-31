import * as vscode from 'vscode';
import { AgentOrbit } from '../core/agent/AgentOrbit';
import { ToolRegistry } from '../core/tools/registry';
import { ToolApprovalManager } from '../core/tools/ToolApprovalManager';
import { ReadFileTool, WriteFileTool, ListFilesTool, ReplaceInFileTool } from '../core/tools/implementations/FileSystem';
import { SearchFilesTool } from '../core/tools/implementations/Search';
import { RunCommandTool } from '../core/tools/implementations/Terminal';
import { GetProblemsTool } from '../core/tools/implementations/Lsp';
import { CodebaseSearchTool } from '../core/tools/implementations/CodebaseSearch';
import { ProviderRegistry } from '../providers/registry';
import { ProviderAdapter } from '../core/providers/ProviderAdapter';
import { BaseProvider } from '../providers/base';
import { SessionManager } from '../core/session/SessionManager';

import * as path from 'node:path';
import { EditManager } from '../core/edits/EditManager';
import { DiffContentProvider } from '../core/edits/DiffContentProvider';
import { CheckpointManager } from '../core/edits/CheckpointManager';
import type { ToolCall } from '../core/types';
import { getWebviewHtml } from './chatView/webviewHtml';
import { handleSearchFiles, handleResolveContextItems } from './chatView/search';
import { hydrateHistory, clearHistory } from './chatView/history';
import { handleSendMessage } from './chatView/sendMessage';
import { postWebviewSettings, applySettingsUpdate } from './chatView/settings';
import { sendSessionList, saveHistory } from './chatView/sessionHistory';
import { sendCheckpointList } from './chatView/checkpoints';
import { ToolApprovalController } from './chatView/toolApprovals';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _agent?: AgentOrbit;
  private _toolRegistry: ToolRegistry;
  private _sessionManager: SessionManager;
  private _lastActiveEditor: vscode.TextEditor | undefined;
  private _providerRegistry: ProviderRegistry;
  private _toolApprovalManager: ToolApprovalManager;
  private _toolApprovalController: ToolApprovalController;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri
  ) {
    this._toolApprovalManager = ToolApprovalManager.getInstance();
    this._toolRegistry = new ToolRegistry({
      approveTool: (call) => this._requestToolApproval(call)
    });
    this._toolRegistry.register(new ReadFileTool());
    this._toolRegistry.register(new WriteFileTool());
    this._toolRegistry.register(new ReplaceInFileTool());
    this._toolRegistry.register(new ListFilesTool());
    this._toolRegistry.register(new SearchFilesTool());
    this._toolRegistry.register(new CodebaseSearchTool());
    this._toolRegistry.register(new RunCommandTool());
    this._toolRegistry.register(new GetProblemsTool());
    
    this._sessionManager = new SessionManager(context);
    this._providerRegistry = new ProviderRegistry();
    this._toolApprovalController = new ToolApprovalController(
      this._sessionManager,
      (state) => {
        this._view?.webview.postMessage({
          type: 'toolApprovalState',
          sessionAllowAllTools: state.sessionAllowAllTools,
          allowedTools: state.allowedTools
        });
      }
    );
    
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

    const isDevelopment = false; // FORCE PRODUCTION MODE: Fixes blank screen when Vite server is not running.
    webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri, isDevelopment);

    // Subscribe to EditManager events
    EditManager.getInstance().onDidProposeEdit((edit) => {
        const autoApprove = vscode.workspace.getConfiguration('aisCode').get<boolean>('autoApprove') ?? true;
        if (autoApprove) {
            return;
        }
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

    this._toolApprovalManager.onDidRequest((request) => {
        this._view?.webview.postMessage({
            type: 'toolApprovalRequest',
            request
        });
    });

    CheckpointManager.getInstance().onDidChange(() => {
        sendCheckpointList(this._view);
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
        case 'toolApprovalResponse': {
            const approvalData = data as { id: string; approved: boolean };
            this._toolApprovalManager.resolveApproval(approvalData.id, approvalData.approved);
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
          await clearHistory(this._sessionManager, this._view);
          break;
        case 'updateSettings':
          await this._handleUpdateSettings(data.settings as Record<string, unknown>);
          break;
        case 'webviewLoaded':
          this._updateWebviewSettings();
          await this._sessionManager.init(); // Ensure we are ready
          await this._hydrateHistory();
          await this._sendSessionList();
          this._toolApprovalController.syncSessionToolApprovals();
          sendCheckpointList(this._view);
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
        case 'setSessionToolApprovals':
          this._toolApprovalController.setSessionAllowAllTools(!!data.allowAll);
          break;
        case 'setToolApproval':
          this._toolApprovalController.setToolApprovalForTool(data.toolName as string, !!data.allow);
          break;
        case 'getCheckpoints':
          sendCheckpointList(this._view);
          break;
        case 'restoreCheckpoint': {
          const checkpointId = data.id as string | undefined;
          const manager = CheckpointManager.getInstance();
          const restored = checkpointId ? await manager.restoreById(checkpointId) : await manager.restoreLast();
          if (!restored) {
            vscode.window.showInformationMessage('AIS Code: No checkpoints to restore.');
          } else {
            const fileName = restored.filePath.split(/[/\\]/).pop();
            vscode.window.showInformationMessage(`AIS Code: Restored checkpoint for ${fileName}.`);
          }
          break;
        }
        case 'searchFiles':
          await handleSearchFiles(this._view, data.query as string);
          break;
        case 'resolveContextItems':
          await handleResolveContextItems(this._view, data.paths as string[]);
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
    const config = vscode.workspace.getConfiguration('aisCode');
    postWebviewSettings(this._view, config);
  }

  private async _handleUpdateSettings(settings: Record<string, unknown>) {
    const config = vscode.workspace.getConfiguration('aisCode');
    await applySettingsUpdate(settings, config);

    vscode.window.showInformationMessage('AIS Code: Settings updated');
    
    // Force agent re-initialization on next message
    this._agent = undefined;
  }

  private async _requestToolApproval(call: ToolCall): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('aisCode');
    const autoApprove = config.get<boolean>('autoApprove') ?? true;
    if (this._toolApprovalController.isApproved(call.name, autoApprove)) return true;

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.arguments || '{}');
    } catch {
      args = {};
    }

    const { title, description } = this._toolApprovalController.formatApproval(call.name, args);

    return this._toolApprovalManager.requestApproval({
      toolCallId: call.id,
      toolName: call.name,
      title,
      description,
      args
    });
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
    await hydrateHistory(this._view, this._sessionManager);
  }

  private async _sendSessionList() {
    await sendSessionList(this._view, this._sessionManager);
  }

  private async _saveHistory() {
    await saveHistory({
      agent: this._agent,
      sessionManager: this._sessionManager,
      view: this._view,
      createProviderAdapter: () => this._createProviderAdapter()
    });
  }

  private async _handleCreateSession() {
    const session = await this._sessionManager.createSession();
    this._agent = undefined; // clear agent
    await this._sessionManager.setToolApprovalState(session.id, { allowAll: false, tools: [] });
    this._toolApprovalController.syncSessionToolApprovals();
    await this._hydrateHistory();
    await this._sendSessionList();
  }

  private async _handleLoadSession(sessionId: string) {
    if (this._sessionManager.activeSessionId === sessionId) return;
    
    await this._sessionManager.setActiveSession(sessionId);
    this._agent = undefined; // clear agent to reload context
    this._toolApprovalController.syncSessionToolApprovals();
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
    this._toolApprovalController.syncSessionToolApprovals();
    await this._sendSessionList();
  }

  private async _handleSendMessage(text: string, contextItems?: { type: string; value: string }[]) {
    await handleSendMessage(
      {
        view: this._view,
        toolRegistry: this._toolRegistry,
        sessionManager: this._sessionManager,
        createProviderAdapter: () => this._createProviderAdapter(),
        getAgent: () => this._agent,
        setAgent: (agent) => {
          this._agent = agent;
        },
        lastActiveEditor: this._lastActiveEditor,
        saveHistory: () => this._saveHistory()
      },
      text,
      contextItems
    );
  }

}
