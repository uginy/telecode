import { useState } from 'react';
import { useVSCode } from '../../hooks/useVSCode';
import type { WebviewMessage } from '../../types/bridge';
import { ToolCallCard, ToolCallPayload } from './ToolCallCard';

interface CodeBlockProps {
  language: string;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  if (language === 'tool') {
    const payload = parseToolPayload(code);
    if (payload) {
      return <ToolCallCard payload={payload} />;
    }
  }

  const [copied, setCopied] = useState(false);
  const { postMessage } = useVSCode();
  const isContextBlock = language.includes(':');
  const [contextType, contextName] = isContextBlock ? language.split(':', 2) : [null, null];
  const [isExpanded, setIsExpanded] = useState(false);
  const terminalInfo = contextType === 'terminal' ? parseTerminalContext(code) : null;
  const displayCode = terminalInfo?.output ?? code;
  const normalizedLanguage = language.toLowerCase();
  const isCommandLanguage = ['bash', 'sh', 'shell', 'zsh', 'powershell', 'ps1', 'cmd'].includes(normalizedLanguage);
  const isCommandBlock = !isContextBlock && (isCommandLanguage || looksLikeCommand(code));

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleReview = () => {
    const targetPath = extractTargetPath(code);
    postMessage({
      type: 'reviewDiff',
      code,
      language,
      targetPath
    } as WebviewMessage);
  };

  const handleApply = () => {
    const targetPath = extractTargetPath(code);
    postMessage({
      type: 'applyDiff',
      code,
      targetPath
    } as WebviewMessage);
  };

  const handleRun = () => {
    const command = sanitizeCommand(code);
    if (!command) {
      return;
    }
    postMessage({
      type: 'runCommand',
      command
    } as WebviewMessage);
  };

  const extractTargetPath = (code: string): string | undefined => {
    const lines = code.split('\n').slice(0, 3);
    for (const line of lines) {
      const match = line.match(/\/\/\s*file:\s*([^\s]+)/i);
      if (match) {
        return match[1];
      }
      const blockMatch = line.match(/\/\*\s*file:\s*([^\s]+)/i);
      if (blockMatch) {
        return blockMatch[1];
      }
    }
    const diffMatch = code.match(/^diff --git a\/(.+?) b\/(.+)$/m);
    if (diffMatch) {
      return diffMatch[2];
    }
    const plusMatch = code.match(/^\+\+\+\s+b\/(.+)$/m);
    if (plusMatch) {
      return plusMatch[1];
    }
    return undefined;
  };

  return (
    <div className={`code-block ${isContextBlock ? 'context-block' : ''}`}>
      <div className="code-header">
        <div className="code-header-left">
          <span className="code-language">
            {isContextBlock ? (contextName || 'Context') : language}
            {isContextBlock && contextType && (
              <span className="context-badge">{contextType}</span>
            )}
          </span>
          {terminalInfo?.command && (
            <span className="context-meta">
              <span className="context-meta-label">Last</span>
              <span className="context-meta-command">{terminalInfo.command}</span>
              {terminalInfo.time && (
                <span className="context-meta-time">{formatTime(terminalInfo.time)}</span>
              )}
            </span>
          )}
        </div>
        {isContextBlock ? (
          <button
            className="context-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        ) : (
          <div className="code-actions">
            {isCommandBlock ? (
              <button
                className="run-button"
                onClick={handleRun}
                title="Run command"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </button>
            ) : (
              <>
                <button
                  className="apply-button"
                  onClick={handleApply}
                  title="Apply Changes"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </button>
                <button
                  className="review-button"
                  onClick={handleReview}
                  title="Review Diff"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </button>
              </>
            )}
            <button 
              className="copy-button"
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy code'}
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
        )}
      </div>
      {isContextBlock ? (
        <pre className={`code-content ${isExpanded ? 'expanded' : 'collapsed'}`}>
          {isExpanded && <code>{displayCode}</code>}
        </pre>
      ) : (
        <pre className="code-content">
          <code>{displayCode}</code>
        </pre>
      )}
    </div>
  );
}

function parseToolPayload(content: string): ToolCallPayload | null {
  try {
    const parsed = JSON.parse(content.trim());
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as ToolCallPayload;
  } catch {
    return null;
  }
}

function looksLikeCommand(content: string) {
  const trimmed = content.trim();
  return trimmed.startsWith('$ ') || trimmed.startsWith('> ');
}

function sanitizeCommand(content: string) {
  return content
    .split('\n')
    .map((line) => line.replace(/^\s*[$>]\s?/, ''))
    .join('\n')
    .trim();
}

function parseTerminalContext(content: string) {
  const lines = content.split('\n');
  const commandLineIndex = lines.findIndex((line) => line.startsWith('Command:'));
  const timeLineIndex = lines.findIndex((line) => line.startsWith('Time:'));
  const exitLineIndex = lines.findIndex((line) => line.startsWith('Exit code:'));
  const metaEnd = Math.max(commandLineIndex, timeLineIndex, exitLineIndex);
  let outputLines = lines;
  if (metaEnd >= 0) {
    outputLines = lines.slice(metaEnd + 1);
    while (outputLines.length > 0 && outputLines[0].trim() === '') {
      outputLines = outputLines.slice(1);
    }
  }

  const command = commandLineIndex >= 0 ? lines[commandLineIndex].replace('Command:', '').trim() : null;
  const time = timeLineIndex >= 0 ? lines[timeLineIndex].replace('Time:', '').trim() : null;

  return {
    command,
    time,
    output: outputLines.join('\n')
  };
}

function formatTime(value: string) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString();
  }
  return value;
}
