import { useMemo } from 'react';
import { useVSCode } from '../../hooks/useVSCode';
import { useApprovalStore } from '../../stores/approvalStore';
import type { WebviewMessage } from '../../types/bridge';

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(timestamp).toLocaleDateString();
}

export function ApprovalPanel() {
  const { postMessage } = useVSCode();
  const { current, queue, history, resolveRequest } = useApprovalStore();

  const pending = useMemo(() => {
    const list = current ? [current, ...queue] : [...queue];
    return list;
  }, [current, queue]);

  const handleDecision = (requestId: string, decision: 'approve' | 'deny') => {
    const resolved = resolveRequest(requestId, decision);
    if (!resolved) return;
    const message: WebviewMessage = {
      type: 'approvalResponse',
      requestId: resolved.requestId,
      decision
    };
    postMessage(message);
  };

  return (
    <div className="approval-panel">
      <div className="approval-panel-header">
        <span>Approvals</span>
        {pending.length > 0 && <span className="approval-badge">{pending.length}</span>}
      </div>

      {pending.length === 0 ? (
        <div className="approval-empty">No pending approvals</div>
      ) : (
        <div className="approval-list">
          {pending.map((req) => (
            <div key={req.requestId} className="approval-item">
              <div className="approval-item-title">{req.title}</div>
              <div className="approval-item-desc">{req.description}</div>
              {req.detail && <div className="approval-item-detail">{req.detail}</div>}
              <div className="approval-actions">
                <button className="approval-button deny" onClick={() => handleDecision(req.requestId, 'deny')}>
                  Deny
                </button>
                <button className="approval-button approve" onClick={() => handleDecision(req.requestId, 'approve')}>
                  Approve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="approval-history">
          <div className="approval-history-header">Recent</div>
          <div className="approval-history-list">
            {history.slice(0, 8).map((entry) => (
              <div key={entry.request.requestId} className={`approval-history-item ${entry.decision}`}>
                <span className="approval-history-title">{entry.request.title}</span>
                <span className="approval-history-time">{formatRelativeTime(entry.decidedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

