import React, { useEffect, useCallback } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { useChatStore } from '@/store/useChatStore';

interface VsCodeApi {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

declare const vscode: VsCodeApi;

const generateId = () => Math.random().toString(36).substring(2, 11);

const App: React.FC = () => {
  const { 
    addMessage, 
    updateLastMessage, 
    setStreaming, 
    updateSettings 
  } = useChatStore();

  useEffect(() => {
    console.log('[AIS] Webview initialized');
    
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (!message || typeof message !== 'object' || !message.type) return;

      console.log('[AIS] Received message:', message.type);

      switch (message.type) {
        case 'streamToken':
          updateLastMessage(message.text || '');
          break;
        case 'setSettings':
          updateSettings(message.settings);
          break;
        case 'setStreaming':
          setStreaming(!!message.value);
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [updateLastMessage, updateSettings, setStreaming]);

  const handleSend = useCallback((text: string) => {
    addMessage({ id: generateId(), role: 'user', content: text });
    vscode.postMessage({ type: 'sendMessage', text });
  }, [addMessage]);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans">
        <ChatHeader />
        <MessageList />
        <ChatInput onSend={handleSend} />
      </div>
    </TooltipProvider>
  );
};

export default App;
