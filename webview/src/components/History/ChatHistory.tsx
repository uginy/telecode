import { useHistoryStore } from '../../stores/historyStore';
import { useConfirmStore } from '../../stores/confirmStore';
import { ChatHistoryItem } from './ChatHistoryItem';
import { NewChatButton } from './NewChatButton';

export function ChatHistory() {
  const { chats, currentChatId, isLoading, loadChat, deleteChat, createChat } = useHistoryStore();
  const confirm = useConfirmStore((state) => state.open);

  const handleDelete = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    const approved = await confirm({
      title: 'Delete chat',
      description: 'This will permanently remove the chat history.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel'
    });
    if (approved) {
      deleteChat(chatId);
    }
  };

  return (
    <div className="chat-history">
      <NewChatButton onClick={createChat} />
      
      {isLoading && chats.length === 0 ? (
        <div className="chat-history-loading">Loading...</div>
      ) : (
        <div className="chat-history-list">
          {chats.map((chat) => (
            <ChatHistoryItem
              key={chat.id}
              chat={chat}
              isActive={chat.id === currentChatId}
              onClick={() => loadChat(chat.id)}
              onDelete={(e) => handleDelete(e, chat.id)}
            />
          ))}
          {chats.length === 0 && (
            <div className="chat-history-empty">No chats yet</div>
          )}
        </div>
      )}
    </div>
  );
}
