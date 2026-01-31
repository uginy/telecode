import * as vscode from 'vscode';
import { EditManager } from './EditManager';

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
    static scheme = 'ais-diff';

    provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
        // URI format: ais-diff:/path/to/file?id=uuid
        const query = new URLSearchParams(uri.query);
        const editId = query.get('id');

        if (!editId) {
            return 'Error: No edit ID provided.';
        }

        const edit = EditManager.getInstance().getEdit(editId);
        if (!edit) {
            return 'Error: Edit not found or expired.';
        }

        return edit.newContent;
    }
}
