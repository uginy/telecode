import * as vscode from 'vscode';

/**
 * Saves any open and unsaved settings.json files to avoid VS Code 
 * blocking global configuration updates.
 */
export async function saveOpenSettingsFiles(): Promise<void> {
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.uri.fsPath.endsWith('settings.json') && doc.isDirty) {
      await doc.save();
    }
  }
}
