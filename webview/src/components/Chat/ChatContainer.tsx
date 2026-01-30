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
  const { messages, isLoading, error, status } = useChatStore();
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (!isAtBottomRef.current) {
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const container = messagesAreaRef.current;
    if (!container) return;

    const handleScroll = () => {
      const threshold = 48;
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      isAtBottomRef.current = distanceFromBottom < threshold;
    };

    container.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSend = (content: string) => {
    if (!content.trim() || isLoading) return;
    onSendMessage(content.trim());
  };

  return (
    <div className="chat-container">
      <div className="messages-area" ref={messagesAreaRef}>
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
            {status && (
              <div className="message-bubble assistant status">
                <div className="message-avatar">
                  <div className="avatar ai-avatar">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                  </div>
                </div>
                <div className="message-content">
                  <span className="status-text">{status}</span>
                  {isLoading && <span className="status-dots" aria-hidden="true" />}
                </div>
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
