import * as vscode from 'vscode';

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  static scheme = 'ais-diff';
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  private _contentMap = new Map<string, string>();

  get onDidChange(): vscode.Event<vscode.Uri> {
    return this._onDidChange.event;
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this._contentMap.get(uri.path) || '';
  }

  updateContent(uri: vscode.Uri, content: string) {
    this._contentMap.set(uri.path, content);
    this._onDidChange.fire(uri);
  }
}
