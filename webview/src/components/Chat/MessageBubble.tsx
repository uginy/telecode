import ReactMarkdown from 'react-markdown';
import { Message } from '../../stores/chatStore';
import { CodeBlock } from './CodeBlock';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`message-bubble ${isUser ? 'user' : 'assistant'} ${isStreaming ? 'streaming' : ''}`}>
      <div className="message-avatar">
        {isUser ? (
          <div className="avatar user-avatar">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
        ) : (
          <div className="avatar ai-avatar">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>
        )}
      </div>
      <div className="message-content">
        <ReactMarkdown
          components={{
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              const isInline = !match;
              
              if (isInline) {
                return (
                  <code className="inline-code" {...props}>
                    {children}
                  </code>
                );
              }
              
              return (
                <CodeBlock
                  language={match[1]}
                  code={String(children).replace(/\n$/, '')}
                />
              );
            },
            p({ children }) {
              return <p className="message-paragraph">{children}</p>;
            },
            ul({ children }) {
              return <ul className="message-list">{children}</ul>;
            },
            ol({ children }) {
              return <ol className="message-list ordered">{children}</ol>;
            },
            li({ children }) {
              return <li className="message-list-item">{children}</li>;
            },
            a({ href, children }) {
              return (
                <a href={href} target="_blank" rel="noopener noreferrer" className="message-link">
                  {children}
                </a>
              );
            },
            blockquote({ children }) {
              return <blockquote className="message-blockquote">{children}</blockquote>;
            }
          }}
        >
          {message.content || (isStreaming ? '...' : '')}
        </ReactMarkdown>
        {isStreaming && (
          <span className="cursor-blink">▊</span>
        )}
      </div>
    </div>
  );
}
