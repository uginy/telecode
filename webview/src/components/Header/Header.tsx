import { useSettingsStore } from '../../stores/settingsStore';

interface HeaderProps {
  onNewChat: () => void;
}

export function Header({ onNewChat }: HeaderProps) {
  const { openSettings, openHistory, openApprovals } = useSettingsStore();

  return (
    <header className="app-header">
      <div className="header-actions">
        <button 
          className="header-button" 
          onClick={onNewChat}
          title="New Chat"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
        </button>
        <button 
          className="header-button" 
          onClick={openHistory}
          title="History"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M13 3a9 9 0 1 0 8.95 10h-2.02A7 7 0 1 1 13 5V3zm-1 4h2v6l4 2-.8 1.8L12 14V7zm9-3v6h-6l2.2-2.2A9.95 9.95 0 0 0 13 2C7.48 2 3 6.48 3 12h2a8 8 0 0 1 8-8c2.12 0 4.07.83 5.5 2.2L21 4z"/>
          </svg>
        </button>
        <button 
          className="header-button" 
          onClick={openApprovals}
          title="Approvals"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M9 16.2l-3.5-3.5L4 14.2 9 19l11-11-1.5-1.5z"/>
          </svg>
        </button>
        <button 
          className="header-button settings-button" 
          onClick={openSettings}
          title="Settings"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
      </div>
    </header>
  );
}
