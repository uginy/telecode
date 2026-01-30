import type React from 'react';
import { cn } from '@/lib/utils';
import { ToolCallItem } from './ToolCallItem';

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResult {
  toolCallId: string;
  output: string;
  isError: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResult?: ToolResult;
  toolResults?: Record<string, ToolResult>;
}

interface MessageItemProps {
  message: Message;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const isUser = message.role === 'user';
  
  if (message.role === 'tool') return null; // We render tool results inside assistant messages

  const renderContent = () => {
    if (isUser) {
      return (
        <div className="text-foreground bg-muted/50 px-3 py-1.5 rounded-2xl rounded-tr-none shadow-sm">
          {message.content}
        </div>
      );
    }

    // Assistant message parsing
    const parts: React.ReactNode[] = [];
    const content = message.content;
    
    // Combined regex for all tool tags
    const toolRegex = /<(write_file|read_file|list_files|run_command)(\s+path="([^"]+)")?\s*\/?>([\s\S]*?)<\/\1>|<(read_file|list_files)\s+path="([^"]+)"\s*\/>/g;
    
    let lastIndex = 0;
    
    // Use matchAll to avoid biome lint on assignment in expression
    const matches = Array.from(content.matchAll(toolRegex));
    const resultValues = Object.values(message.toolResults || {});
    let toolCallIndex = 0;

    for (const match of matches) {
      const matchIndex = match.index || 0;
      // Add text before the tool call
      if (matchIndex > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`} className="whitespace-pre-wrap">
            {content.substring(lastIndex, matchIndex)}
          </span>
        );
      }

      const tagName = match[1] || match[5];
      const path = match[3] || match[6];
      const toolContent = match[4] || "";
      
      const args: Record<string, string> = {};
      if (path) args.path = path;
      if (tagName === 'run_command') args.command = toolContent;
      if (tagName === 'write_file') args.content = toolContent;

      // Find tool result by index
      const result = resultValues[toolCallIndex] as ToolResult | undefined;
      toolCallIndex++;

      parts.push(
        <ToolCallItem 
          key={`tool-${matchIndex}`}
          name={tagName}
          args={args}
          result={result}
        />
      );

      lastIndex = matchIndex + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(
        <span key={`text-${lastIndex}`} className="whitespace-pre-wrap">
          {content.substring(lastIndex)}
        </span>
      );
    }

    return (
      <div className="text-foreground pl-1 font-medium">
        {parts.length > 0 ? parts : message.content}
      </div>
    );
  };

  return (
    <div className={cn(
      "px-4 py-2 flex flex-col gap-1 transition-colors",
      isUser 
        ? "items-end bg-background" 
        : "items-start border-l-2 border-primary/30 bg-primary/10"
    )}>
      <div className="flex items-center gap-1.5 px-0.5 mt-1">
        <span className="text-[10px] font-bold tracking-wider uppercase opacity-70 select-none text-foreground/50">
          {isUser ? 'You' : 'AIS'}
        </span>
      </div>
      <div className={cn(
        "text-xs leading-relaxed max-w-[95%] break-words",
        isUser ? "pb-1" : ""
      )}>
        {renderContent()}
      </div>
    </div>
  );
};
