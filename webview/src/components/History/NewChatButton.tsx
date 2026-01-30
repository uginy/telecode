interface NewChatButtonProps {
  onClick: () => void;
}

export function NewChatButton({ onClick }: NewChatButtonProps) {
  return (
    <button className="new-chat-button" onClick={onClick}>
      <span className="new-chat-button-icon">+</span>
      <span>New Chat</span>
    </button>
  );
}
