import type * as vscode from 'vscode';
import { CheckpointManager } from '../../core/edits/CheckpointManager';

export function sendCheckpointList(view: vscode.WebviewView | undefined) {
  if (!view) return;
  const checkpoints = CheckpointManager.getInstance().getCheckpoints();
  view.webview.postMessage({
    type: 'checkpointList',
    checkpoints
  });
}
