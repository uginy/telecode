import React from 'react';
import { cn } from '@/lib/utils';
import { ToolCallItem } from './ToolCallItem';
import type { Message, ToolResult } from './messageTypes';
import { EditProposalCard, ToolApprovalCard } from './ApprovalCards';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { Badge } from '../ui/badge';
interface MessageItemProps {
  message: Message;
  statusText?: string;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message, statusText }) => {
  const isUser = message.role === 'user';
  
  if (message.role === 'tool') return null; 

  if (message.isApprovalRequest && message.approvalData) {
      return (
        <div className="px-4 py-2 flex flex-col gap-1 w-full items-start border-l-2 border-primary/30 bg-primary/10">
            <div className="flex items-center gap-1.5 px-0.5 mt-1 w-full relative justify-start">
                 <span className="text-[10px] font-bold tracking-wider uppercase opacity-70 select-none text-foreground/50">AIS SYSTEM</span>
            </div>
            <EditProposalCard data={message.approvalData} />
        </div>
      );
  }

  if (message.isToolApprovalRequest && message.toolApprovalData) {
      return (
        <div className="px-4 py-2 flex flex-col gap-1 w-full items-start border-l-2 border-primary/30 bg-primary/10">
            <div className="flex items-center gap-1.5 px-0.5 mt-1 w-full relative justify-start">
                 <span className="text-[10px] font-bold tracking-wider uppercase opacity-70 select-none text-foreground/50">AIS SYSTEM</span>
            </div>
            <ToolApprovalCard data={message.toolApprovalData} />
        </div>
      );
  }

  const renderContent = () => {
    if (isUser) {
    // ... existing logic ...
      return (
        <div className="text-[13px] leading-relaxed whitespace-pre-wrap text-foreground">
          {message.content}
        </div>
      );
    }

    // Assistant message parsing
    const parts: React.ReactNode[] = [];
    const content = message.content;
    
    // Combined regex for all tool tags - more robust with spaces
    // Group 1: blockTagName, Group 2: blockPath, Group 3: blockContent, Group 4: selfClosingTagName, Group 5: selfClosingPath, Group 6: emptyTagName
    const toolRegex = /<(write_file|replace_in_file|read_file|list_files|run_command|search_files|codebase_search|get_problems)(?:\s+path\s*=\s*"([^"]*)")?\s*>([\s\S]*?)<\/\1>|<(read_file|list_files|get_problems)\s+path\s*=\s*"([^"]*)"\s*\/>|<(get_problems)\s*\/>/g;
    
    let lastIndex = 0;
    
    // Use matchAll to avoid biome lint on assignment in expression
    const matches = Array.from(content.matchAll(toolRegex));
    const resultValues = Object.values(message.toolResults || {});
    let toolCallIndex = 0;

    // Define reusable markdown components
    const markdownComponents: any = {
      p: ({children}: any) => <p className="mb-2 last:mb-0">{children}</p>,
      code: ({node, className, children, ...props}: any) => {
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
      pre: ({children}: any) => <pre className="p-0 my-2 rounded-lg overflow-hidden bg-[#0d1117] border border-white/10">{children}</pre>,
      ul: ({children}: any) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
      ol: ({children}: any) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
      a: ({href, children}: any) => <a href={href} className="text-primary underline underline-offset-4 hover:opacity-80 transition-opacity" target="_blank" rel="noopener noreferrer">{children}</a>,
    };

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
                components={markdownComponents}
              >
                {textPart}
              </ReactMarkdown>
            </div>
          );
        }
      }

      const tagName = match[1] || match[4] || match[6];
      const path = match[2] || match[5]; 
      const toolContent = match[3] || "";
      
      const args: Record<string, string> = {};
      if (path) args.path = path;
      if (tagName === 'run_command') args.command = toolContent;
      if (tagName === 'write_file' || tagName === 'replace_in_file') args.content = toolContent;
      if (tagName === 'search_files') args.query = toolContent;

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
      const remainingText = content.substring(lastIndex);
      
      // Check for PARTIAL tool tag at the end - also more robust
      const partialRegex = /<(write_file|replace_in_file|read_file|list_files|run_command|search_files|codebase_search|get_problems)(?:\s+path\s*=\s*"([^"]*)")?\s*(\/?>)?([\s\S]*)$/;
      const partialMatch = remainingText.match(partialRegex);

      if (partialMatch) {
          const pIndex = partialMatch.index || 0;
          
          if (pIndex > 0) {
              const textBefore = remainingText.substring(0, pIndex);
              if (textBefore.trim()) {
                  parts.push(
                    <div key={`text-${lastIndex}`} className="markdown-body text-xs prose prose-invert max-w-none leading-normal">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
                            {textBefore}
                        </ReactMarkdown>
                    </div>
                  );
              }
          }

          const tagName = partialMatch[1];
          const path = partialMatch[2]; 
          
          const args: Record<string, string> = { content: 'Streaming...' };
          if (path) args.path = path;
          
          parts.push(
            <ToolCallItem 
              key={`tool-partial-${lastIndex}`}
              name={tagName}
              args={args}
              result={undefined}
              isStreaming={true} 
            />
          );
      } else {
        // Normal text
        if (remainingText.trim()) {
            parts.push(
            <div key={`text-${lastIndex}`} className="markdown-body text-xs prose prose-invert max-w-none leading-normal">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
                    {remainingText}
                </ReactMarkdown>
            </div>
            );
        }
      }
    }

    return (
      <div className="text-foreground font-medium w-full">
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
      "px-4 py-1 flex flex-col gap-2 transition-colors w-full",
      isUser ? "items-end" : "items-start"
    )}>
      <div className={cn(
        "flex items-center gap-2 w-full",
        isUser ? "justify-end" : "justify-start"
      )}>
        <span className="text-[10px] font-semibold tracking-[0.3em] uppercase text-muted-foreground">
          {isUser ? 'You' : 'AIS'}
        </span>
        {!isUser && statusText ? (
          <Badge variant="outline" className="text-[10px] border-primary/30 text-primary/80">
            {statusText}
          </Badge>
        ) : null}
      </div>
      <div className={cn(
        "text-xs leading-relaxed wrap-break-word",
        isUser ? "w-fit max-w-[82%] pb-1" : "w-full"
      )}>
        <div
          className={cn(
            "rounded-2xl border border-border/60 px-4 py-3 shadow-sm",
            isUser
              ? "bg-primary/15 text-foreground border-primary/20"
              : "bg-card/60 text-foreground"
          )}
        >
          {renderContent()}
        </div>
      </div>
    </div>
  );
};
