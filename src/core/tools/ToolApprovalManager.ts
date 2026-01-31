import * as vscode from 'vscode';

export interface ToolApprovalRequest {
  id: string;
  toolCallId: string;
  toolName: string;
  title: string;
  description?: string;
  args: Record<string, unknown>;
  timestamp: number;
}

interface PendingApproval {
  request: ToolApprovalRequest;
  resolve: (approved: boolean) => void;
}

export class ToolApprovalManager {
  private static _instance: ToolApprovalManager;
  private _pending: Map<string, PendingApproval> = new Map();
  private _onDidRequest = new vscode.EventEmitter<ToolApprovalRequest>();
  public readonly onDidRequest = this._onDidRequest.event;

  private constructor() {}

  public static getInstance(): ToolApprovalManager {
    if (!ToolApprovalManager._instance) {
      ToolApprovalManager._instance = new ToolApprovalManager();
    }
    return ToolApprovalManager._instance;
  }

  public requestApproval(request: Omit<ToolApprovalRequest, 'id' | 'timestamp'>): Promise<boolean> {
    const id = crypto.randomUUID();
    const fullRequest: ToolApprovalRequest = {
      ...request,
      id,
      timestamp: Date.now()
    };

    return new Promise<boolean>((resolve) => {
      this._pending.set(id, { request: fullRequest, resolve });
      this._onDidRequest.fire(fullRequest);
    });
  }

  public resolveApproval(id: string, approved: boolean) {
    const pending = this._pending.get(id);
    if (!pending) return;
    pending.resolve(approved);
    this._pending.delete(id);
  }
}
