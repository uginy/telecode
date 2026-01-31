import type React from 'react';
import { useEffect, useCallback } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { useChatStore, type SearchResult } from '@/store/useChatStore';
import { SettingsView } from '@/components/settings/SettingsView';
import { HistoryView } from '@/components/history/HistoryView';

interface VsCodeApi {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

declare const vscode: VsCodeApi;


const VsCodeApp: React.FC<{ 
  onSend: (text: string, contextItems?: SearchResult[]) => void;
  onSearch: (query: string) => void;
  onStop: () => void;
}> = ({ onSend, onSearch, onStop }) => {
  const { activeView } = useChatStore();

  if (activeView === 'settings') {
    return <SettingsView />;
  }

  if (activeView === 'history') {
    return <HistoryView />;
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans relative">
      <ChatHeader />
      <MessageList />
      <ChatInput onSend={onSend} onSearch={onSearch} onStop={onStop} />
    </div>
  );
};

const App: React.FC = () => {
    const { 
    addMessage, 
    setMessages,
    updateLastMessage, 
    setStreaming, 
    updateSettings 
  } = useChatStore();

  useEffect(() => {
    // Notify backend that we are ready
    if ((window as any).vscode) {
      (window as any).vscode.postMessage({ type: 'webviewLoaded' });
    }

    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (!message || typeof message !== 'object' || !message.type) return;

      switch (message.type) {
        case 'hydrateHistory':
          setMessages(message.history);
          break;
        case 'streamToken':
          updateLastMessage(message.text || '');
          break;
        case 'setSettings':
          updateSettings(message.settings);
          break;
        case 'setStreaming':
          setStreaming(!!message.value);
          break;
        case 'updateSessionList':
          // Update sessions and active ID
          useChatStore.getState().setSessions(message.sessions);
          if (message.activeSessionId) {
            useChatStore.getState().setActiveSessionId(message.activeSessionId);
          }
          break;
        case 'updateUsage':
          useChatStore.getState().updateUsage(message.usage);
          break;
        case 'toolResult':
          useChatStore.getState().addToolResult(message.result);
          break;
        case 'searchResults':
          useChatStore.getState().setSearchResults(message.results);
          break;
        case 'addContextItems':
          if (Array.isArray(message.items)) {
             message.items.forEach((item: SearchResult) => {
                 useChatStore.getState().addContextItem(item);
             });
          }
          break;
        case 'toolApprovalRequest':
          if (message.edit) {
            addMessage({
              id: `approval-edit-${message.edit.id}`,
              role: 'assistant',
              content: '',
              isApprovalRequest: true,
              approvalData: message.edit
            });
          } else if (message.request) {
            addMessage({
              id: `approval-tool-${message.request.id}`,
              role: 'assistant',
              content: '',
              isToolApprovalRequest: true,
              toolApprovalData: message.request
            });
          }
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [updateLastMessage, updateSettings, setStreaming]);

  const handleSend = useCallback((text: string, contextItems: SearchResult[] = []) => {
    addMessage({ id: Math.random().toString(36).substring(2, 11), role: 'user', content: text });
    
    try {
      if ((window as any).vscode) {
        (window as any).vscode.postMessage({ type: 'sendMessage', text, contextItems });
      } else {
        console.error('[AIS] window.vscode is missing!');
      }
    } catch (e) {
      console.error('[AIS] Error posting message:', e);
    }
  }, [addMessage]);

  const handleSearch = useCallback((query: string) => {
    try {
      if ((window as any).vscode) {
        (window as any).vscode.postMessage({ type: 'searchFiles', query });
      }
    } catch (e) {
      console.error('[AIS] Error posting search:', e);
    }
  }, []);

  const handleStop = useCallback(() => {
    try {
      if ((window as any).vscode) {
        (window as any).vscode.postMessage({ type: 'stop' });
      }
    } catch (e) {
      console.error('[AIS] Error posting stop:', e);
    }
  }, []);

  return (
    <TooltipProvider>
      <VsCodeApp onSend={handleSend} onSearch={handleSearch} onStop={handleStop} />
    </TooltipProvider>
  );
};

export default App;
