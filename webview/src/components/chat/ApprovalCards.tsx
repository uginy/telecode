import React from 'react';
import { Check, X, Eye } from 'lucide-react';
import { Button } from '../ui/button';
import type { EditProposal, ToolApprovalRequest } from './messageTypes';

export const EditProposalCard: React.FC<{ data: EditProposal }> = ({ data }) => {
  const [status, setStatus] = React.useState<'pending' | 'approved' | 'rejected'>('pending');

  const handleAction = (action: 'approve' | 'reject' | 'diff') => {
    if (action === 'diff') {
      (window as any).vscode?.postMessage({ type: 'openDiff', id: data.id });
      return;
    }

    (window as any).vscode?.postMessage({
      type: 'editApproval',
      id: data.id,
      approved: action === 'approve',
    });

    setStatus(action === 'approve' ? 'approved' : 'rejected');
  };

  if (status !== 'pending') {
    return (
      <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border mt-2">
        {status === 'approved' ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-red-500" />}
        <span className="text-xs opacity-70">
          Edit to <code>{data.filePath.split(/[/\\]/).pop()}</code> {status}.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 bg-muted/30 rounded-lg border border-blue-500/30 mt-2">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-blue-400">PROPOSED EDIT</span>
          <code className="text-[11px] bg-background px-1.5 py-0.5 rounded break-all">
            {data.filePath.split(/[/\\]/).pop()}
          </code>
          <span className="text-[11px] opacity-70">{data.description}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => handleAction('diff')}
        >
          <Eye className="w-3.5 h-3.5" />
          Review Diff
        </Button>
      </div>
      <div className="flex gap-2 w-full">
        <Button
          className="flex-1 h-8 text-xs bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30"
          variant="outline"
          onClick={() => handleAction('approve')}
        >
          <Check className="w-3.5 h-3.5 mr-1.5" />
          Approve
        </Button>
        <Button
          className="flex-1 h-8 text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30"
          variant="outline"
          onClick={() => handleAction('reject')}
        >
          <X className="w-3.5 h-3.5 mr-1.5" />
          Reject
        </Button>
      </div>
    </div>
  );
};

export const ToolApprovalCard: React.FC<{ data: ToolApprovalRequest }> = ({ data }) => {
  const [status, setStatus] = React.useState<'pending' | 'approved' | 'rejected'>('pending');
  const [isExpanded, setIsExpanded] = React.useState(false);

  const handleAction = (action: 'approve_once' | 'approve_session' | 'approve_tool' | 'reject') => {
    if (action === 'approve_session') {
      (window as any).vscode?.postMessage({
        type: 'setSessionToolApprovals',
        allowAll: true,
      });
    }

    if (action === 'approve_tool') {
      (window as any).vscode?.postMessage({
        type: 'setToolApproval',
        toolName: data.toolName,
        allow: true,
      });
    }

    (window as any).vscode?.postMessage({
      type: 'toolApprovalResponse',
      id: data.id,
      approved: action !== 'reject',
    });

    setStatus(action === 'reject' ? 'rejected' : 'approved');
  };

  if (status !== 'pending') {
    return (
      <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border mt-2">
        {status === 'approved' ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-red-500" />}
        <span className="text-xs opacity-70">
          Tool request {status}.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 bg-muted/30 rounded-lg border border-border mt-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-blue-400">TOOL APPROVAL</span>
          <span className="text-[11px] opacity-80">{data.title}</span>
          {data.description && (
            <span className="text-[11px] opacity-60">{data.description}</span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? 'Hide' : 'Details'}
        </Button>
      </div>

      {isExpanded && (
        <pre className="p-2 bg-card/80 rounded border border-border text-[10px] font-mono overflow-x-auto max-h-40">
          {JSON.stringify(data.args, null, 2)}
        </pre>
      )}

      <div className="flex gap-2 w-full flex-wrap">
        <Button
          className="flex-1 h-8 text-xs bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30"
          variant="outline"
          onClick={() => handleAction('approve_once')}
        >
          <Check className="w-3.5 h-3.5 mr-1.5" />
          Approve once
        </Button>
        <Button
          className="flex-1 h-8 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-600/30"
          variant="outline"
          onClick={() => handleAction('approve_session')}
        >
          <Check className="w-3.5 h-3.5 mr-1.5" />
          Approve this chat
        </Button>
        <Button
          className="flex-1 h-8 text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/30"
          variant="outline"
          onClick={() => handleAction('approve_tool')}
        >
          <Check className="w-3.5 h-3.5 mr-1.5" />
          Always allow tool
        </Button>
        <Button
          className="flex-1 h-8 text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30"
          variant="outline"
          onClick={() => handleAction('reject')}
        >
          <X className="w-3.5 h-3.5 mr-1.5" />
          Reject
        </Button>
      </div>
    </div>
  );
};
