import * as vscode from 'vscode';
import { ChatViewProvider } from './panels/ChatViewProvider';
import { DiffContentProvider } from './core/edits/DiffContentProvider';
import { CheckpointManager } from './core/edits/CheckpointManager';
import { FileContextTracker } from './core/context/FileContextTracker';
import { SemanticIndex } from './core/context/SemanticIndex';

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

  context.subscriptions.push(FileContextTracker.getInstance());
  context.subscriptions.push(SemanticIndex.getInstance().initWatcher());

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
    vscode.commands.registerCommand('aisCode.newConversation', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.ais-code');
      await chatViewProvider.createNewConversation();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aisCode.restoreLastCheckpoint', async () => {
      const checkpoint = await CheckpointManager.getInstance().restoreLast();
      if (!checkpoint) {
        vscode.window.showInformationMessage('AIS Code: No checkpoints to restore.');
        return;
      }

      const fileName = checkpoint.filePath.split(/[/\\]/).pop();
      vscode.window.showInformationMessage(`AIS Code: Restored checkpoint for ${fileName}.`);
    })
  );

  if (process.env.AIS_CODE_TEST_MODE === '1') {
    setTimeout(() => {
      void vscode.commands.executeCommand('aisCode.openChat');
    }, 1000);
    context.subscriptions.push(
      vscode.commands.registerCommand('aisCode.test.runMessage', async (payload) => {
        return chatViewProvider.runTestMessage(payload as { text: string; contextItems?: { type: string; value: string }[]; timeoutMs?: number });
      })
    );
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aisCode')) {
        // Handle config changes if needed
      }
    })
  );
}

export function deactivate() {}
