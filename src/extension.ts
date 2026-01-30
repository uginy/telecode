import * as vscode from 'vscode';
import { ChatViewProvider } from './panels/ChatViewProvider';
import { ProviderRegistry } from './providers/registry';

let chatViewProvider: ChatViewProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('AIS Code is now active!');

  // Initialize provider registry
  const providerRegistry = new ProviderRegistry();

  // Register the chat view provider
  chatViewProvider = new ChatViewProvider(context.extensionUri, providerRegistry);
  
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
    vscode.commands.registerCommand('aisCode.openChat', () => {
      // Focus on the chat view
      vscode.commands.executeCommand('aisCode.chatView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aisCode.newConversation', () => {
      chatViewProvider?.newConversation();
    })
  );

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aisCode')) {
        chatViewProvider?.updateConfiguration();
      }
    })
  );
}

export function deactivate() {
  chatViewProvider = undefined;
}
