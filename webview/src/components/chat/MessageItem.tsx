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

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

interface MessageItemProps {
  message: Message;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const isUser = message.role === 'user';
  
  if (message.role === 'tool') return null; // We render tool results inside assistant messages

  const renderContent = () => {
    if (isUser) {
      return (
        <div className="text-foreground bg-muted/50 px-3 py-1.5 rounded-2xl rounded-tr-none shadow-sm whitespace-pre-wrap">
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
        const textPart = content.substring(lastIndex, matchIndex);
        if (textPart.trim()) {
          parts.push(
            <div key={`text-${lastIndex}`} className="markdown-body text-xs prose prose-invert max-w-none leading-normal">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]} 
                rehypePlugins={[rehypeHighlight]}
                components={{
                  p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                  code: ({node, className, children, ...props}) => {
                    const match = /language-(\w+)/.exec(className || '');
                    return match ? (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    ) : (
                      <code className="bg-muted px-1.5 py-0.5 rounded-md text-[11px] font-mono" {...props}>
                        {children}
                      </code>
                    );
                  },
                  pre: ({children}) => <pre className="p-0 my-2 rounded-lg overflow-hidden bg-[#0d1117] border border-white/10">{children}</pre>,
                  ul: ({children}) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                  ol: ({children}) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                  a: ({href, children}) => <a href={href} className="text-primary underline underline-offset-4 hover:opacity-80 transition-opacity" target="_blank" rel="noopener noreferrer">{children}</a>,
                }}
              >
                {textPart}
              </ReactMarkdown>
            </div>
          );
        }
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
      const textPart = content.substring(lastIndex);
      if (textPart.trim()) {
        parts.push(
          <div key={`text-${lastIndex}`} className="markdown-body text-xs prose prose-invert max-w-none leading-normal">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]} 
              rehypePlugins={[rehypeHighlight]}
              components={{
                p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                code: ({node, className, children, ...props}) => {
                  const match = /language-(\w+)/.exec(className || '');
                  return match ? (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  ) : (
                    <code className="bg-muted px-1.5 py-0.5 rounded-md text-[11px] font-mono" {...props}>
                      {children}
                    </code>
                  );
                },
                pre: ({children}) => <pre className="p-0 my-2 rounded-lg overflow-hidden bg-[#0d1117] border border-white/10">{children}</pre>,
                ul: ({children}) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                ol: ({children}) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                a: ({href, children}) => <a href={href} className="text-primary underline underline-offset-4 hover:opacity-80 transition-opacity" target="_blank" rel="noopener noreferrer">{children}</a>,
              }}
            >
              {textPart}
            </ReactMarkdown>
          </div>
        );
      }
    }

    return (
      <div className="text-foreground pl-1 font-medium w-full">
        {parts.length > 0 ? parts : (
           <div className="markdown-body text-xs prose prose-invert max-w-none leading-normal">
             <ReactMarkdown 
               remarkPlugins={[remarkGfm]} 
               rehypePlugins={[rehypeHighlight]}
               components={{
                 p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                 code: ({node, className, children, ...props}) => {
                    const match = /language-(\w+)/.exec(className || '');
                    return match ? (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    ) : (
                      <code className="bg-muted px-1.5 py-0.5 rounded-md text-[11px] font-mono" {...props}>
                        {children}
                      </code>
                    );
                 },
                 pre: ({children}) => <pre className="p-0 my-2 rounded-lg overflow-hidden bg-[#0d1117] border border-white/10">{children}</pre>,
                 ul: ({children}) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                 ol: ({children}) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                 a: ({href, children}) => <a href={href} className="text-primary underline underline-offset-4 hover:opacity-80 transition-opacity" target="_blank" rel="noopener noreferrer">{children}</a>,
               }}
             >
               {message.content}
             </ReactMarkdown>
           </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn(
      "px-4 py-2 flex flex-col gap-1 transition-colors w-full",
      isUser 
        ? "items-end bg-background" 
        : "items-start border-l-2 border-primary/30 bg-primary/10"
    )}>
      <div className={cn(
        "flex items-center gap-1.5 px-0.5 mt-1 w-full relative",
        isUser ? "justify-end" : "justify-start"
      )}>
        <span className="text-[10px] font-bold tracking-wider uppercase opacity-70 select-none text-foreground/50">
          {isUser ? 'You' : 'AIS'}
        </span>
      </div>
      <div className={cn(
        "text-xs leading-relaxed break-words",
        isUser ? "w-fit max-w-[85%] pb-1" : "w-full"
      )}>
        {renderContent()}
      </div>
    </div>
  );
};
