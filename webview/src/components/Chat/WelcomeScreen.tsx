export function WelcomeScreen() {
  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <div className="welcome-logo">
          <svg viewBox="0 0 48 48" fill="none" width="64" height="64">
            <circle cx="24" cy="24" r="22" fill="url(#gradient)" />
            <path 
              d="M16 20L24 12L32 20M16 28L24 36L32 28M24 18V30" 
              stroke="white" 
              strokeWidth="2.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
            <defs>
              <linearGradient id="gradient" x1="0" y1="0" x2="48" y2="48">
                <stop stopColor="#6366f1" />
                <stop offset="1" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <h1 className="welcome-title">Welcome to AIS Code</h1>
        <p className="welcome-subtitle">
          AI-powered coding assistant with multi-agent architecture
        </p>
        <div className="welcome-features">
          <div className="feature">
            <span className="feature-icon">💬</span>
            <span>Ask questions about your code</span>
          </div>
          <div className="feature">
            <span className="feature-icon">✨</span>
            <span>Generate new code and features</span>
          </div>
          <div className="feature">
            <span className="feature-icon">🐛</span>
            <span>Debug and fix issues</span>
          </div>
          <div className="feature">
            <span className="feature-icon">📝</span>
            <span>Explain and document code</span>
          </div>
        </div>
        <p className="welcome-hint">
          Type a message below to get started
        </p>
      </div>
    </div>
  );
}
