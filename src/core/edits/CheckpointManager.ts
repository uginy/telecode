import * as vscode from 'vscode';

export interface Checkpoint {
  id: string;
  filePath: string;
  content: string;
  existed: boolean;
  timestamp: number;
  description: string;
}

export class CheckpointManager {
  private static _instance: CheckpointManager;
  private _checkpoints: Checkpoint[] = [];
  private _maxCheckpoints = 25;
  private _onDidChange = new vscode.EventEmitter<Checkpoint[]>();
  public readonly onDidChange = this._onDidChange.event;

  private constructor() {}

  public static getInstance(): CheckpointManager {
    if (!CheckpointManager._instance) {
      CheckpointManager._instance = new CheckpointManager();
    }
    return CheckpointManager._instance;
  }

  public addCheckpoint(filePath: string, content: string, existed: boolean, description: string) {
    const checkpoint: Checkpoint = {
      id: crypto.randomUUID(),
      filePath,
      content,
      existed,
      timestamp: Date.now(),
      description
    };

    this._checkpoints.unshift(checkpoint);
    if (this._checkpoints.length > this._maxCheckpoints) {
      this._checkpoints = this._checkpoints.slice(0, this._maxCheckpoints);
    }
    this._onDidChange.fire(this.getCheckpoints());
  }

  public getCheckpoints(): Checkpoint[] {
    return [...this._checkpoints];
  }

  public async restoreLast(): Promise<Checkpoint | null> {
    const checkpoint = this._checkpoints.shift();
    if (!checkpoint) return null;

    const uri = vscode.Uri.file(checkpoint.filePath);
    if (!checkpoint.existed) {
      try {
        await vscode.workspace.fs.delete(uri);
      } catch {
        // Ignore if file already removed
      }
      return checkpoint;
    }

    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(checkpoint.content));
    await vscode.window.showTextDocument(uri, { preview: true, preserveFocus: true });
    this._onDidChange.fire(this.getCheckpoints());
    return checkpoint;
  }

  public async restoreById(id: string): Promise<Checkpoint | null> {
    const index = this._checkpoints.findIndex(c => c.id === id);
    if (index === -1) return null;

    const [checkpoint] = this._checkpoints.splice(index, 1);
    const uri = vscode.Uri.file(checkpoint.filePath);
    if (!checkpoint.existed) {
      try {
        await vscode.workspace.fs.delete(uri);
      } catch {
        // Ignore if file already removed
      }
      this._onDidChange.fire(this.getCheckpoints());
      return checkpoint;
    }

    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(checkpoint.content));
    await vscode.window.showTextDocument(uri, { preview: true, preserveFocus: true });
    this._onDidChange.fire(this.getCheckpoints());
    return checkpoint;
  }
}
