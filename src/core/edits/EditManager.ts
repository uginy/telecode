import * as vscode from 'vscode';
import * as path from 'path';

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

    public addPendingEdit(filePath: string, newContent: string, description: string = 'Proposed changes'): string {
        const id = crypto.randomUUID();
        // Just store the new content for now. Original content will be read on demand or stored if needed for 3-way merge.
        // Actually, to show a DIFF, we need the original. But VS Code Diff Editor just needs (left URI, right URI).
        // Left URI = file on disk. Right URI = virtual document with new content.
        
        this._pendingEdits.set(id, {
            id,
            filePath,
            originalContent: '', // Not strictly needed for the provider if we diff against file on disk
            newContent,
            timestamp: Date.now(),
            description
        });

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
        
        this._pendingEdits.delete(id);
        return `Successfully applied edit to ${path.basename(edit.filePath)}`;
    }

    public rejectEdit(id: string) {
        this._pendingEdits.delete(id);
    }
}
