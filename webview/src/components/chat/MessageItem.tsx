import React from 'react';
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

export interface EditProposal {
    id: string;
    filePath: string;
    description: string;
    timestamp: number;
}

export interface ToolApprovalRequest {
  id: string;
  toolCallId: string;
  toolName: string;
  title: string;
  description?: string;
  args: Record<string, unknown>;
  timestamp: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResult?: ToolResult;
  toolResults?: Record<string, ToolResult>;
  approvalData?: EditProposal;
  isApprovalRequest?: boolean;
  toolApprovalData?: ToolApprovalRequest;
  isToolApprovalRequest?: boolean;
}

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { Button } from '../ui/button';
import { Check, X, Eye } from 'lucide-react';

const EditProposalCard: React.FC<{ data: EditProposal }> = ({ data }) => {
    const [status, setStatus] = React.useState<'pending' | 'approved' | 'rejected'>('pending');

    const handleAction = (action: 'approve' | 'reject' | 'diff') => {
        if (action === 'diff') {
            (window as any).vscode?.postMessage({ type: 'openDiff', id: data.id });
            return;
        }

        (window as any).vscode?.postMessage({ 
            type: 'editApproval', 
            id: data.id, 
            approved: action === 'approve' 
        });

        setStatus(action === 'approve' ? 'approved' : 'rejected');
    };

    if (status !== 'pending') {
         return (
             <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border mt-2">
                 {status === 'approved' ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-red-500" />}
                 <span className="text-xs opacity-70">
                     Edit to <code>{data.filePath.split(/[/\\]/).pop()}</code> {status}.
                 </span>
             </div>
         );
    }

    return (
        <div className="flex flex-col gap-3 p-3 bg-muted/30 rounded-lg border border-blue-500/30 mt-2">
            <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-blue-400">PROPOSED EDIT</span>
                    <code className="text-[11px] bg-background px-1.5 py-0.5 rounded break-all">
                        {data.filePath.split(/[/\\]/).pop()}
                    </code>
                    <span className="text-[11px] opacity-70">{data.description}</span>
                </div>
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-xs gap-1.5"
                    onClick={() => handleAction('diff')}
                >
                    <Eye className="w-3.5 h-3.5" />
                    Review Diff
                </Button>
            </div>
            <div className="flex gap-2 w-full">
                 <Button 
                    className="flex-1 h-8 text-xs bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30"
                    variant="outline"
                    onClick={() => handleAction('approve')}
                 >
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                    Approve
                 </Button>
                 <Button 
                    className="flex-1 h-8 text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30"
                    variant="outline"
                    onClick={() => handleAction('reject')}
                 >
                    <X className="w-3.5 h-3.5 mr-1.5" />
                    Reject
                 </Button>
            </div>
        </div>
    );
};

const ToolApprovalCard: React.FC<{ data: ToolApprovalRequest }> = ({ data }) => {
    const [status, setStatus] = React.useState<'pending' | 'approved' | 'rejected'>('pending');
    const [isExpanded, setIsExpanded] = React.useState(false);

    const handleAction = (action: 'approve_once' | 'approve_session' | 'approve_always' | 'reject') => {
        if (action === 'approve_session') {
            (window as any).vscode?.postMessage({
                type: 'setSessionToolApprovals',
                allowAll: true
            });
        }

        if (action === 'approve_always') {
            (window as any).vscode?.postMessage({
                type: 'updateSettings',
                settings: { autoApprove: true }
            });
        }

        (window as any).vscode?.postMessage({
            type: 'toolApprovalResponse',
            id: data.id,
            approved: action !== 'reject'
        });

        setStatus(action === 'reject' ? 'rejected' : 'approved');
    };

    if (status !== 'pending') {
        return (
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border mt-2">
                {status === 'approved' ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-red-500" />}
                <span className="text-xs opacity-70">
                    Tool request {status}.
                </span>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3 p-3 bg-muted/30 rounded-lg border border-border mt-2">
            <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-blue-400">TOOL APPROVAL</span>
                    <span className="text-[11px] opacity-80">{data.title}</span>
                    {data.description && (
                        <span className="text-[11px] opacity-60">{data.description}</span>
                    )}
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {isExpanded ? 'Hide' : 'Details'}
                </Button>
            </div>

            {isExpanded && (
                <pre className="p-2 bg-black/40 rounded border border-white/10 text-[10px] font-mono overflow-x-auto max-h-40">
                    {JSON.stringify(data.args, null, 2)}
                </pre>
            )}

            <div className="flex gap-2 w-full flex-wrap">
                <Button 
                    className="flex-1 h-8 text-xs bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30"
                    variant="outline"
                    onClick={() => handleAction('approve_once')}
                >
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                    Approve once
                </Button>
                <Button 
                    className="flex-1 h-8 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-600/30"
                    variant="outline"
                    onClick={() => handleAction('approve_session')}
                >
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                    Approve this chat
                </Button>
                <Button 
                    className="flex-1 h-8 text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/30"
                    variant="outline"
                    onClick={() => handleAction('approve_always')}
                >
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                    Always allow
                </Button>
                <Button 
                    className="flex-1 h-8 text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30"
                    variant="outline"
                    onClick={() => handleAction('reject')}
                >
                    <X className="w-3.5 h-3.5 mr-1.5" />
                    Reject
                </Button>
            </div>
        </div>
    );
};
interface MessageItemProps {
  message: Message;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
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
        <div className="text-foreground bg-muted/50 px-3 py-1.5 rounded-2xl rounded-tr-none shadow-sm whitespace-pre-wrap">
          {message.content}
        </div>
      );
    }

    // Assistant message parsing
    const parts: React.ReactNode[] = [];
    const content = message.content;
    
    // Combined regex for all tool tags - more robust with spaces
    // Group 1: blockTagName, Group 2: blockPath, Group 3: blockContent, Group 4: selfClosingTagName, Group 5: selfClosingPath, Group 6: emptyTagName
    const toolRegex = /<(write_file|replace_in_file|read_file|list_files|run_command|search_files|get_problems)(?:\s+path\s*=\s*"([^"]*)")?\s*>([\s\S]*?)<\/\1>|<(read_file|list_files|get_problems)\s+path\s*=\s*"([^"]*)"\s*\/>|<(get_problems)\s*\/>/g;
    
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
      const partialRegex = /<(write_file|replace_in_file|read_file|list_files|run_command|search_files|get_problems)(?:\s+path\s*=\s*"([^"]*)")?\s*(\/?>)?([\s\S]*)$/;
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
        "text-xs leading-relaxed wrap-break-word",
        isUser ? "w-fit max-w-[85%] pb-1" : "w-full"
      )}>
        {renderContent()}
      </div>
    </div>
  );
};
