import { useState } from 'react';
import { useVSCode } from '../../hooks/useVSCode';
import type { WebviewMessage } from '../../types/bridge';

type ToolType = 'run_command' | 'read_file' | 'list_files' | 'write_file';

export interface ToolCallPayload {
  type: ToolType;
  command?: string;
  path?: string;
  size?: number;
}

interface ToolCallCardProps {
  payload: ToolCallPayload;
}

const TITLE_MAP: Record<ToolType, string> = {
  run_command: 'Run command',
  read_file: 'Read file',
  list_files: 'List files',
  write_file: 'Write file'
};

export function ToolCallCard({ payload }: ToolCallCardProps) {
  const { postMessage } = useVSCode();
  const [copied, setCopied] = useState(false);
  const title = TITLE_MAP[payload.type] ?? 'Tool call';
  const primaryText = payload.type === 'run_command' ? payload.command : payload.path;

  const handleCopy = async () => {
    const text = payload.type === 'run_command' ? payload.command : payload.path;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const handleRun = () => {
    if (payload.type !== 'run_command' || !payload.command) return;
    const commandPayload: WebviewMessage = { type: 'runCommand', command: payload.command };
    postMessage(commandPayload);
  };

  return (
    <div className="tool-card">
      <div className="tool-card-header">
        <div className="tool-card-title">{title}</div>
        <div className="tool-card-actions">
          {payload.type === 'run_command' && (
            <button className="tool-card-button" onClick={handleRun} title="Run command">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
          )}
          {primaryText && (
            <button className="tool-card-button" onClick={handleCopy} title={copied ? 'Copied' : 'Copy'}>
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
          )}
        </div>
      </div>
      <div className="tool-card-body">
        {primaryText ? (
          <div className="tool-card-primary">{primaryText}</div>
        ) : (
          <div className="tool-card-muted">No details available.</div>
        )}
        {payload.type === 'write_file' && typeof payload.size === 'number' && (
          <div className="tool-card-meta">{payload.size} chars</div>
        )}
      </div>
    </div>
  );
}
