import { useVSCode } from '../../hooks/useVSCode';
import { useApprovalStore } from '../../stores/approvalStore';
import type { WebviewMessage } from '../../types/bridge';

export function ApprovalModal() {
  const { postMessage } = useVSCode();
  const { current, resolveCurrent } = useApprovalStore();

  if (!current) return null;

  const handleDecision = (decision: 'approve' | 'deny') => {
    const resolved = resolveCurrent();
    if (!resolved) return;
    const message: WebviewMessage = {
      type: 'approvalResponse',
      requestId: resolved.requestId,
      decision
    };
    postMessage(message);
  };

  const detail = current.detail ? (
    <div className="modal-detail">{current.detail}</div>
  ) : null;

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <h2>{current.title}</h2>
        </div>
        <div className="modal-body">
          <p>{current.description}</p>
          {detail}
        </div>
        <div className="modal-footer">
          <button className="modal-button secondary" onClick={() => handleDecision('deny')}>
            Deny
          </button>
          <button className="modal-button primary" onClick={() => handleDecision('approve')}>
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
