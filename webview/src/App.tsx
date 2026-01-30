import { ChatContainer } from './components/Chat/ChatContainer';
import { Header } from './components/Header/Header';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { HistoryPage } from './components/History/HistoryPage';
import { ApprovalModal } from './components/Approvals/ApprovalModal';
import { ApprovalsPage } from './components/Approvals/ApprovalsPage';
import { ConfirmModal } from './components/Approvals/ConfirmModal';
import { useVSCode } from './hooks/useVSCode';
import { useChatStore } from './stores/chatStore';
import { useSettingsStore } from './stores/settingsStore';
import { useHistoryStore } from './stores/historyStore';
import { useApprovalStore } from './stores/approvalStore';
import { useEffect } from 'react';
import type { ExtensionMessage, WebviewMessage } from './types/bridge';

function App() {
  const { postMessage, onMessage } = useVSCode();
  const { addMessage, updateStreamingMessage, setMessages, setError, setLoading, saveCurrentChat } = useChatStore();
  const { isOpen, closeSettings, config, setConfig, isHistoryOpen, closeHistory, isApprovalsOpen, closeApprovals } = useSettingsStore();
  const { setChats, setCurrentChatId, loadHistory } = useHistoryStore();
  const enqueueApproval = useApprovalStore((state) => state.enqueue);

  useEffect(() => {
    postMessage({ type: 'getMessages' });
    postMessage({ type: 'getConfig' });
    postMessage({ type: 'loadHistory' });

    const cleanup = onMessage((message: ExtensionMessage) => {
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
        case 'approvalRequest':
          if (useSettingsStore.getState().config.autoApprove) {
            postMessage({
              type: 'approvalResponse',
              requestId: message.request.requestId,
              decision: 'approve'
            } as WebviewMessage);
          } else {
            enqueueApproval(message.request);
          }
          break;
      }
    });

    return cleanup;
  }, [postMessage, onMessage, addMessage, updateStreamingMessage, setMessages, setError, setLoading, setConfig, setChats, setCurrentChatId, loadHistory, saveCurrentChat]);

  const handleSendMessage = (content: string) => {
    const payload: WebviewMessage = { type: 'sendMessage', content };
    postMessage(payload);
  };

  const handleAbort = () => {
    const payload: WebviewMessage = { type: 'abortGeneration' };
    postMessage(payload);
  };

  const handleNewChat = () => {
    const payload: WebviewMessage = { type: 'createChat' };
    postMessage(payload);
  };

  const handleSaveSettings = (newConfig: typeof config) => {
    setConfig(newConfig);
    const payload: WebviewMessage = { type: 'saveConfig', config: newConfig };
    postMessage(payload);
  };

  if (isOpen) {
    return (
      <div className="app settings-only">
        <SettingsPanel
          isOpen={isOpen}
          onClose={closeSettings}
          config={config}
          onSave={handleSaveSettings}
        />
        <ConfirmModal />
      </div>
    );
  }

  if (isHistoryOpen) {
    return (
      <div className="app settings-only">
        <HistoryPage onClose={closeHistory} />
        <ConfirmModal />
      </div>
    );
  }

  if (isApprovalsOpen) {
    return (
      <div className="app settings-only">
        <ApprovalsPage onClose={closeApprovals} />
        <ConfirmModal />
      </div>
    );
  }

  return (
    <div className="app">
      <div className="main-content">
        <Header onNewChat={handleNewChat} />
        <ChatContainer 
          onSendMessage={handleSendMessage}
          onAbort={handleAbort}
        />
        <ApprovalModal />
        <ConfirmModal />
      </div>
    </div>
  );
}

export default App;
