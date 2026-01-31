import * as vscode from 'vscode';
import * as path from 'node:path';

export interface PendingEdit {
    id: string;
    filePath: string;
    originalContent: string;
    newContent: string;
    timestamp: number;
    description: string;
}

export class EditManager {
    private static _instance: EditManager;
    private _pendingEdits: Map<string, PendingEdit> = new Map();
    
    // Event emitter to notify UI about new edits
    private _onDidProposeEdit = new vscode.EventEmitter<PendingEdit>();
    public readonly onDidProposeEdit = this._onDidProposeEdit.event;

    private constructor() {}

    public static getInstance(): EditManager {
        if (!EditManager._instance) {
            EditManager._instance = new EditManager();
        }
        return EditManager._instance;
    }

    public addPendingEdit(filePath: string, newContent: string, description = 'Proposed changes'): string {
        const id = crypto.randomUUID();
        const edit: PendingEdit = {
            id,
            filePath,
            originalContent: '', 
            newContent,
            timestamp: Date.now(),
            description
        };
        
        this._pendingEdits.set(id, edit);

        // Notify listeners so UI updates
        this._onDidProposeEdit.fire(edit);

        return id;
    }

    public getEdit(id: string): PendingEdit | undefined {
        return this._pendingEdits.get(id);
    }

    public async applyEdit(id: string): Promise<string> {
        const edit = this._pendingEdits.get(id);
        if (!edit) {
            throw new Error(`Edit ${id} not found.`);
        }

        const uri = vscode.Uri.file(edit.filePath);
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(edit.newContent));
        
        // Ensure the document is visible so the user sees the change
        await vscode.window.showTextDocument(uri, { preview: true, preserveFocus: true });

        this._pendingEdits.delete(id);
        return `Successfully applied edit to ${path.basename(edit.filePath)}`;
    }

    public rejectEdit(id: string) {
        this._pendingEdits.delete(id);
    }
}
