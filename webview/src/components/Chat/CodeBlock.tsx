import { useState } from 'react';
import { useVSCode } from '../../hooks/useVSCode';

interface CodeBlockProps {
  language: string;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const { postMessage } = useVSCode();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleReview = () => {
    // Try to extract path from comments
    const lines = code.split('\n').slice(0, 3);
    let targetPath: string | undefined;
    
    for (const line of lines) {
      const match = line.match(/\/\/\s*(?:file:)?\s*([^\s]+)/i);
      if (match) {
         targetPath = match[1];
         break;
      }
    }

    postMessage({
      type: 'reviewDiff',
      code,
      language,
      targetPath
    });
  };

  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-language">{language}</span>
        <div className="code-actions">
          <button 
            className="review-button"
            onClick={handleReview}
            title="Review Diff"
            style={{ marginRight: '8px', cursor: 'pointer', background: 'none', border: 'none', color: 'inherit' }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
          </button>
          <button 
            className="copy-button"
            onClick={handleCopy}
            title={copied ? 'Copied!' : 'Copy code'}
            style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'inherit' }}
          >
            {copied ? (
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
              </svg>
            )}
          </button>
        </div>
      </div>
      <pre className="code-content">
        <code>{code}</code>
      </pre>
    </div>
  );
}
