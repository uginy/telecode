import { useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { useChatStore } from '../../stores/chatStore';
import { WelcomeScreen } from './WelcomeScreen';

interface ChatContainerProps {
  onSendMessage: (content: string) => void;
  onAbort: () => void;
}

export function ChatContainer({ onSendMessage, onAbort }: ChatContainerProps) {
  const { messages, isLoading, error } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (content: string) => {
    if (!content.trim() || isLoading) return;
    onSendMessage(content.trim());
  };

  return (
    <div className="chat-container">
      <div className="messages-area">
        {messages.length === 0 ? (
          <WelcomeScreen />
        ) : (
          <>
            {messages.map((message, index) => (
              <MessageBubble
                key={index}
                message={message}
                isStreaming={isLoading && index === messages.length - 1 && message.role === 'assistant'}
              />
            ))}
            {error && (
              <div className="error-message">
                <span className="error-icon">⚠️</span>
                <span>{error}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      <MessageInput 
        onSend={handleSend} 
        onAbort={onAbort}
        isLoading={isLoading} 
      />
    </div>
  );
}
