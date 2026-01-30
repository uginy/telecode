import type React from 'react';
import { useEffect, useCallback } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { useChatStore } from '@/store/useChatStore';
import { SettingsView } from '@/components/settings/SettingsView';

interface VsCodeApi {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

declare const vscode: VsCodeApi;

const VsCodeApp: React.FC<{ onSend: (text: string) => void }> = ({ onSend }) => {
  const { activeView } = useChatStore();

  if (activeView === 'settings') {
    return <SettingsView />;
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans">
      <ChatHeader />
      <MessageList />
      <ChatInput onSend={onSend} />
    </div>
  );
};

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
        case 'updateUsage':
          useChatStore.getState().updateUsage(message.usage);
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [updateLastMessage, updateSettings, setStreaming]);

  const handleSend = useCallback((text: string) => {
    addMessage({ id: Math.random().toString(36).substring(2, 11), role: 'user', content: text });
    vscode.postMessage({ type: 'sendMessage', text });
  }, [addMessage]);

  return (
    <TooltipProvider>
      <VsCodeApp onSend={handleSend} />
    </TooltipProvider>
  );
};

export default App;
