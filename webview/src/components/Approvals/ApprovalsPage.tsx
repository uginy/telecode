import { ApprovalPanel } from './ApprovalPanel';

interface ApprovalsPageProps {
  onClose: () => void;
}

export function ApprovalsPage({ onClose }: ApprovalsPageProps) {
  return (
    <div className="approvals-page">
      <div className="approvals-page-header">
        <div className="approvals-page-title">
          <div>
            <div className="approvals-page-title-text">Approvals</div>
            <div className="approvals-page-subtitle">Review and control pending actions</div>
          </div>
        </div>
        <div className="approvals-page-actions">
          <button className="approvals-page-button" onClick={onClose}>Back</button>
        </div>
      </div>
      <div className="approvals-page-body">
        <ApprovalPanel />
      </div>
    </div>
  );
}

