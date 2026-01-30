import { ChatContainer } from './components/Chat/ChatContainer';
import { useVSCode } from './hooks/useVSCode';
import { useChatStore } from './stores/chatStore';
import { useEffect } from 'react';

function App() {
  const { postMessage, onMessage } = useVSCode();
  const { addMessage, updateStreamingMessage, setMessages, setError, setLoading } = useChatStore();

  useEffect(() => {
    // Request initial messages
    postMessage({ type: 'getMessages' });
    postMessage({ type: 'getConfig' });

    // Listen for messages from extension
    const cleanup = onMessage((message) => {
      switch (message.type) {
        case 'messages':
          setMessages(message.messages);
          break;
        case 'messageAdded':
          addMessage(message.message);
          if (message.isStreaming) {
            setLoading(true);
          }
          break;
        case 'streamToken':
          updateStreamingMessage(message.messageIndex, message.token);
          break;
        case 'streamComplete':
          setLoading(false);
          break;
        case 'error':
          setError(message.message);
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
