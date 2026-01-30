import { useState, useRef, useEffect, KeyboardEvent, useLayoutEffect } from 'react';
import { useVSCode } from '../../hooks/useVSCode';
import { useChatStore } from '../../stores/chatStore';
import { useContextSearch } from '../../hooks/useContextSearch';
import { ContextMenu } from './ContextMenu';
import { ContextItem } from '../../types/context';

interface MessageInputProps {
  onSend: (content: string) => void;
  onAbort: () => void;
  isLoading: boolean;
}

export function MessageInput({ onSend, onAbort, isLoading }: MessageInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const caretPositionRef = useRef<number>(0);
  const { postMessage } = useVSCode();
  const { attachments, removeContext, clearContext } = useChatStore();
  
  const { 
    isActive, 
    results, 
    selectedIndex, 
    setSelectedIndex, 
    handleInput, 
    clearSearch,
    triggerIndex,
    query
  } = useContextSearch();

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  // Handle input changes with caret position using layout effect to avoid race conditions
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (textarea && caretPositionRef.current > 0) {
      handleInput(value, caretPositionRef.current);
    }
  }, [value, handleInput]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isActive && results.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((selectedIndex + 1) % results.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((selectedIndex - 1 + results.length) % results.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectContext(results[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        clearSearch();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectContext = (item: ContextItem) => {
    // Remove the @query part
    const before = value.substring(0, triggerIndex);
    const after = value.substring(triggerIndex + query.length + 1); // +1 for @
    
    setValue(before + after);
    clearSearch();

    // Reset textarea cursor position (optional, hard to do perfectly in React)
    
    // Request backend to load this context item
    postMessage({ 
      type: 'requestContextItem', 
      path: item.path,
      contextType: item.type 
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const caretPos = e.target.selectionStart || 0;
    caretPositionRef.current = caretPos;
    console.log('[MessageInput] Input changed:', newValue, 'Caret at:', caretPos);
    setValue(newValue);
    // handleInput is called in useLayoutEffect to avoid race condition
  };

  const handleSend = () => {
    if ((!value.trim() && attachments.length === 0) || isLoading) return;
    
    // Combine content with attachments
    let finalContent = value;
    if (attachments.length > 0) {
      const contextStr = attachments.map(a => 
        `\n\`\`\`${a.type}:${a.name}\n${a.content}\n\`\`\``
      ).join('\n');
      finalContent = `${value}\n\nContext:\n${contextStr}`;
    }

    onSend(finalContent);
    setValue('');
    clearContext();
    clearSearch();
  };

  const handleAttach = () => {
    postMessage({ type: 'getContext' }); // Old behavior: attach active file
  };

  return (
    <div className="message-input-container">
      {attachments.length > 0 && (
        <div className="attachments-list">
          {attachments.map(file => (
            <div key={file.id} className="attachment-chip">
              <span className="attachment-icon">
                {file.type === 'terminal' ? '💻' : file.type === 'problems' ? '⚠️' : '📄'}
              </span>
              <span className="attachment-name">{file.name}</span>
              <button 
                className="remove-attachment"
                onClick={() => removeContext(file.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      
      <div className="input-wrapper" style={{ position: 'relative' }}>
        {isActive && (
          <ContextMenu 
            items={results} 
            selectedIndex={selectedIndex} 
            onSelect={handleSelectContext}
          />
        )}
        
        <textarea
          ref={textareaRef}
          className="message-textarea"
          placeholder="Type a message... (Type @ to add files, terminal, problems)"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          rows={1}
        />
        <div className="input-actions">
          <button 
            className="attach-button"
            onClick={handleAttach}
            title="Add active file"
            disabled={isLoading}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59l1.41 1.41L9 12.41l4 4 6.29-6.29L22 12V6h-6z" opacity="0" />
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
            </svg>
          </button>

          {isLoading ? (
            <button 
              className="abort-button"
              onClick={onAbort}
              title="Stop generating"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            </button>
          ) : (
            <button 
              className="send-button"
              onClick={handleSend}
              disabled={!value.trim() && attachments.length === 0}
              title="Send message"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="input-footer">
        <span className="hint">
          Type <b>@</b> to add context • <kbd>Enter</kbd> to send
        </span>
      </div>
    </div>
  );
}
