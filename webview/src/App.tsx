import React, { useState, useEffect, useCallback } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import type { Message } from '@/components/chat/MessageItem';

interface VsCodeApi {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

declare const vscode: VsCodeApi;

const generateId = () => Math.random().toString(36).substring(2, 11);

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    console.log('[AIS] Webview initialized');
    
    const handler = (event: MessageEvent) => {
      const message = event.data;
      
      // Ignore internal VS Code or other extension messages
      if (!message || typeof message !== 'object' || !message.type) {
        return;
      }

      console.log('[AIS] Received message:', message.type);

      switch (message.type) {
        case 'streamToken':
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant') {
              const updatedLast = { ...last, content: last.content + (message.text || '') };
              return [...prev.slice(0, -1), updatedLast];
            }
            return [...prev, { 
              id: generateId(), 
              role: 'assistant', 
              content: message.text || '' 
            }];
          });
          break;
        default:
          // Ignore unknown types
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;
    
    const newUserMsg: Message = { 
      id: generateId(),
      role: 'user', 
      content: text 
    };
    
    setMessages(prev => [...prev, newUserMsg]);
    setInputValue('');
    
    vscode.postMessage({ type: 'sendMessage', text });
  }, [inputValue]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setInputValue('');
  }, []);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans">
        <ChatHeader onNewChat={handleNewChat} />
        <MessageList messages={messages} />
        <ChatInput 
          value={inputValue} 
          onChange={setInputValue} 
          onSend={handleSend} 
        />
      </div>
    </TooltipProvider>
  );
};

export default App;
