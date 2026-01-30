import { ChatContainer } from './components/Chat/ChatContainer';
import { useVSCode } from './hooks/useVSCode';
import { useChatStore, type Message } from './stores/chatStore';
import { useEffect } from 'react';

// Types for messages from VS Code extension
interface VSCodeMessage {
  type: string;
  messages?: Message[];
  message?: Message | string;
  messageIndex?: number;
  token?: string;
  isStreaming?: boolean;
}

function App() {
  const { postMessage, onMessage } = useVSCode();
  const { addMessage, updateStreamingMessage, setMessages, setError, setLoading } = useChatStore();

  useEffect(() => {
    // Request initial messages
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
  }, [postMessage, onMessage, addMessage, updateStreamingMessage, setMessages, setError, setLoading]);

  const handleSendMessage = (content: string) => {
    postMessage({ type: 'sendMessage', content });
  };

  const handleAbort = () => {
    postMessage({ type: 'abortGeneration' });
  };

  return (
    <div className="app">
      <ChatContainer 
        onSendMessage={handleSendMessage}
        onAbort={handleAbort}
      />
    </div>
  );
}

export default App;
