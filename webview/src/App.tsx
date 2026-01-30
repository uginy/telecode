import { ChatContainer } from './components/Chat/ChatContainer';
import { Header } from './components/Header/Header';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { ChatHistory } from './components/History/ChatHistory';
import { useVSCode } from './hooks/useVSCode';
import { useChatStore, type Message } from './stores/chatStore';
import { useSettingsStore } from './stores/settingsStore';
import { useHistoryStore } from './stores/historyStore';
import { useEffect } from 'react';

interface Model {
  id: string;
  name: string;
  contextWindow: number;
  isFree?: boolean;
}

interface ContextItem {
  id: string;
  name: string;
  content: string;
  type: 'file' | 'selection';
  path: string;
}

interface VSCodeMessage {
  type: string;
  messages?: Message[];
  message?: Message | string;
  messageIndex?: number;
  token?: string;
  isStreaming?: boolean;
  config?: {
    provider: string;
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  provider?: string;
  models?: Model[];
  context?: ContextItem;
  chatId?: string;
  chats?: any[];
  metadata?: any;
  conversationId?: string;
}

function App() {
  const { postMessage, onMessage } = useVSCode();
  const { addMessage, updateStreamingMessage, setMessages, setError, setLoading, saveCurrentChat } = useChatStore();
  const { isOpen, closeSettings, config, setConfig } = useSettingsStore();
  const { setChats, setCurrentChatId, loadHistory } = useHistoryStore();

  useEffect(() => {
    postMessage({ type: 'getMessages' });
    postMessage({ type: 'getConfig' });
    postMessage({ type: 'loadHistory' });

    const cleanup = onMessage((message: VSCodeMessage) => {
      console.log('[App] Received message from extension:', message.type, message);
      switch (message.type) {
        case 'messages':
          if (message.messages) {
            setMessages(message.messages);
          }
          if (message.conversationId) {
            useChatStore.setState({ conversationId: message.conversationId });
            setCurrentChatId(message.conversationId);
          }
          break;
        case 'config':
          if (message.config) {
            setConfig(message.config);
          }
          break;
        case 'modelsFound':
          if (message.models) {
            window.dispatchEvent(new CustomEvent('modelsFound', { 
              detail: { models: message.models } 
            }));
          }
          break;
        case 'contextAdded':
          if (message.context) {
            useChatStore.getState().addContext(message.context);
          }
          break;
        case 'messageAdded':
          if (message.message && typeof message.message === 'object') {
            addMessage(message.message);
          }
          if (message.isStreaming) {
            setLoading(true);
          }
          break;
        case 'streamToken':
          if (message.messageIndex !== undefined && message.token) {
            updateStreamingMessage(message.messageIndex, message.token);
          }
          break;
        case 'streamComplete':
          setLoading(false);
          saveCurrentChat();
          break;
        case 'error':
          if (typeof message.message === 'string') {
            setError(message.message);
          }
          setLoading(false);
          break;
        case 'conversationCleared':
          setMessages([]);
          break;
        case 'historyLoaded':
          if (message.chats) {
            setChats(message.chats);
          }
          break;
        case 'chatLoaded':
          if (message.messages) {
            setMessages(message.messages);
          }
          if (message.chatId) {
            setCurrentChatId(message.chatId);
            useChatStore.setState({ conversationId: message.chatId });
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
            setMessages([]);
            setCurrentChatId(message.metadata.id);
            useChatStore.setState({ conversationId: message.metadata.id });
            loadHistory();
          }
          break;
      }
    });

    return cleanup;
  }, [postMessage, onMessage, addMessage, updateStreamingMessage, setMessages, setError, setLoading, setConfig, setChats, setCurrentChatId, loadHistory, saveCurrentChat]);

  const handleSendMessage = (content: string) => {
    postMessage({ type: 'sendMessage', content });
  };

  const handleAbort = () => {
    postMessage({ type: 'abortGeneration' });
  };

  const handleNewChat = () => {
    postMessage({ type: 'createChat' });
  };

  const handleSaveSettings = (newConfig: typeof config) => {
    setConfig(newConfig);
    postMessage({ type: 'saveConfig', config: newConfig });
  };

  return (
    <div className="app">
      <div className="sidebar">
        <ChatHistory />
      </div>
      <div className="main-content">
        <Header onNewChat={handleNewChat} />
        <ChatContainer 
          onSendMessage={handleSendMessage}
          onAbort={handleAbort}
        />
        <SettingsPanel
          isOpen={isOpen}
          onClose={closeSettings}
          config={config}
          onSave={handleSaveSettings}
        />
      </div>
    </div>
  );
}

export default App;
