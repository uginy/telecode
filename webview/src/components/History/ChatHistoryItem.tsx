import { ChatMetadata } from '../../types/history';

interface ChatHistoryItemProps {
  chat: ChatMetadata;
  isActive: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function ChatHistoryItem({ chat, isActive, onClick, onDelete }: ChatHistoryItemProps) {
  return (
    <div
      className={`chat-history-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <div className="chat-history-item-content">
        <div className="chat-history-item-title" title={chat.title}>
          {chat.title || 'New Chat'}
        </div>
        <div className="chat-history-item-meta">
          {formatRelativeTime(chat.updatedAt)}
        </div>
      </div>
      <button
        className="chat-history-item-delete"
        onClick={onDelete}
        title="Delete chat"
      >
        ×
      </button>
    </div>
  );
}
