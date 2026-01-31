import * as vscode from 'vscode';
import { ChatViewProvider } from './panels/ChatViewProvider';
import { DiffContentProvider } from './core/edits/DiffContentProvider';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('AIS Code');
  outputChannel.appendLine('AIS Code is now active!');

  const chatViewProvider = new ChatViewProvider(context, context.extensionUri);
  const diffProvider = new DiffContentProvider();
  
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

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      DiffContentProvider.scheme,
      diffProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aisCode.openChat', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.ais-code');
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aisCode')) {
        // Handle config changes if needed
      }
    })
  );
}

export function deactivate() {}
