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
              <div className="status-line" aria-live="polite">
                <span className="status-text">{status}</span>
                {isLoading && <span className="status-dots" aria-hidden="true" />}
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
