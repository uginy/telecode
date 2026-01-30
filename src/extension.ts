import * as vscode from 'vscode';
import { ChatViewProvider } from './panels/ChatViewProvider';
import { ProviderRegistry } from './providers/registry';
import { DiffContentProvider } from './providers/diffProvider';

let chatViewProvider: ChatViewProvider | undefined;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('AIS Code');
  outputChannel.appendLine('AIS Code is now active!');
  console.log('AIS Code is now active!');

  // Initialize provider registry
  const providerRegistry = new ProviderRegistry();
  
  // Initialize diff provider
  const diffContentProvider = new DiffContentProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(DiffContentProvider.scheme, diffContentProvider)
  );

  // Register the chat view provider
  chatViewProvider = new ChatViewProvider(context.extensionUri, providerRegistry, diffContentProvider, context, outputChannel);
  
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'aisCode.chatView',
      chatViewProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('aisCode.newChat', () => {
      chatViewProvider?.newConversation();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aisCode.openSettings', () => {
      // settings are handled in webview
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aisCode')) {
        chatViewProvider?.updateConfiguration();
      }
    })
  );
}

export function deactivate() {}
