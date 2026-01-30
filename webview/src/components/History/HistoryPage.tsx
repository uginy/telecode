import { ChatHistory } from './ChatHistory';

interface HistoryPageProps {
  onClose: () => void;
}

export function HistoryPage({ onClose }: HistoryPageProps) {
  return (
    <div className="history-page">
      <div className="history-page-header">
        <div className="history-page-title">
          <span className="history-page-icon">🗂️</span>
          <div>
            <div className="history-page-title-text">History</div>
            <div className="history-page-subtitle">Browse previous conversations</div>
          </div>
        </div>
        <div className="history-page-actions">
          <button className="history-page-button" onClick={onClose}>Back</button>
        </div>
      </div>
      <div className="history-page-body">
        <ChatHistory />
      </div>
    </div>
  );
}

