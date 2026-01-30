import { ChatContainer } from './components/Chat/ChatContainer';
import { Header } from './components/Header/Header';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { useVSCode } from './hooks/useVSCode';
import { useChatStore, type Message } from './stores/chatStore';
import { useSettingsStore } from './stores/settingsStore';
import { useEffect } from 'react';

// Types for messages from VS Code extension
interface Model {
  id: string;
  name: string;
  contextWindow: number;
  isFree?: boolean;
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
}

function App() {
  const { postMessage, onMessage } = useVSCode();
  const { addMessage, updateStreamingMessage, setMessages, setError, setLoading } = useChatStore();
  const { isOpen, closeSettings, config, setConfig } = useSettingsStore();

  useEffect(() => {
    // Request initial data
    postMessage({ type: 'getMessages' });
    postMessage({ type: 'getConfig' });

    // Listen for messages from extension
    const cleanup = onMessage((message: VSCodeMessage) => {
      switch (message.type) {
        case 'messages':
          if (message.messages) {
            setMessages(message.messages);
          }
          break;
        case 'config':
          if (message.config) {
            setConfig(message.config);
          }
          break;
        case 'modelsFound':
          if (message.models) {
            // Dispatch event to settings panel
            window.dispatchEvent(new CustomEvent('modelsFound', { 
              detail: { models: message.models } 
            }));
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
      }
    });

    return cleanup;
  }, [postMessage, onMessage, addMessage, updateStreamingMessage, setMessages, setError, setLoading, setConfig]);

  const handleSendMessage = (content: string) => {
    postMessage({ type: 'sendMessage', content });
  };

  const handleAbort = () => {
    postMessage({ type: 'abortGeneration' });
  };

  const handleNewChat = () => {
    postMessage({ type: 'newConversation' });
  };

  const handleSaveSettings = (newConfig: typeof config) => {
    setConfig(newConfig);
    postMessage({ type: 'saveConfig', config: newConfig });
  };

  return (
    <div className="app">
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
  );
}

export default App;
