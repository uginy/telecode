import { useEffect } from 'react';
import { useHistoryStore } from '../../stores/historyStore';
import { ChatHistoryItem } from './ChatHistoryItem';
import { NewChatButton } from './NewChatButton';

export function ChatHistory() {
  const { chats, currentChatId, isLoading, loadHistory, loadChat, deleteChat, createChat, setChats } = useHistoryStore();

  useEffect(() => {
    loadHistory();

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      switch (message.type) {
        case 'historyLoaded':
          if (message.chats) {
            setChats(message.chats);
          }
          break;
        case 'chatSaved':
          loadHistory();
          break;
        case 'chatDeleted':
          loadHistory();
          break;
        case 'chatCreated':
          if (message.metadata) {
            setChats([message.metadata, ...chats]);
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadHistory, setChats, chats]);

  const handleDelete = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (confirm('Delete this chat?')) {
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
