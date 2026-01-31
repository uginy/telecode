import type React from 'react';
import { useState } from 'react';
import { 
  FileText, Terminal, FolderTree, ChevronDown, ChevronRight, 
  CheckCircle2, XCircle, Loader2, Search, AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolResult } from './messageTypes';

interface ToolCallItemProps {
  name: string;
  args: Record<string, string>;
  result?: ToolResult;
  isStreaming?: boolean;
}

export const ToolCallItem: React.FC<ToolCallItemProps> = ({ 
  name, 
  args, 
  result, 
  isStreaming 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const getIcon = () => {
    switch (name) {
      case 'write_file': return <FileText className="w-3.5 h-3.5" />;
      case 'read_file': return <FileText className="w-3.5 h-3.5" />;
      case 'replace_in_file': return <FileText className="w-3.5 h-3.5 text-orange-400" />;
      case 'list_files': return <FolderTree className="w-3.5 h-3.5" />;
      case 'search_files': return <Search className="w-3.5 h-3.5 text-blue-400" />;
      case 'run_command': return <Terminal className="w-3.5 h-3.5" />;
      case 'get_problems': return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />;
      default: return <Terminal className="w-3.5 h-3.5" />;
    }
  };

  const getLabel = () => {
    switch (name) {
      case 'write_file': return `Write ${args.path}`;
      case 'read_file': return `Read ${args.path}`;
      case 'replace_in_file': return `Edit ${args.path}`;
      case 'list_files': return `List ${args.path}`;
      case 'search_files': return `Search: ${args.content || args.query}`;
      case 'codebase_search': return `Semantic search: ${args.content || args.query}`;
      case 'run_command': return `Run: ${args.command}`;
      case 'get_problems': return `Check Issues${args.path ? `: ${args.path}` : ''}`;
      default: return name;
    }
  };

  const getStatusIcon = () => {
    if (isStreaming || !result) return <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />;
    if (result.isError) return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
  };

  return (
    <div className="my-3 border border-border/60 rounded-2xl overflow-hidden bg-card/60 backdrop-blur-sm animate-in fade-in slide-in-from-left-2 duration-300 shadow-sm">
      <div 
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors group"
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => e.key === 'Enter' && setIsExpanded(!isExpanded)}
        tabIndex={0}
        role="button"
      >
        <div className="h-8 w-8 rounded-lg bg-muted/50 border border-border/60 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
          {getIcon()}
        </div>
        
        <span className="flex-1 text-[12px] font-semibold truncate text-foreground/80">
          {getLabel()}
        </span>
        
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          {isExpanded ? <ChevronDown className="w-3 h-3 opacity-40" /> : <ChevronRight className="w-3 h-3 opacity-40" />}
        </div>
      </div>
      
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-border/60 animate-in slide-in-from-top-1 duration-200">
          {/* Action Arguments */}
          {(name === 'write_file' || name === 'replace_in_file') && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.3em]">Content</p>
              <pre className="p-2 bg-muted/40 rounded border border-border/60 text-[10px] font-mono overflow-x-auto max-h-40">
                {args.content}
              </pre>
            </div>
          )}
          
          {/* Tool Result */}
          {result && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.3em]">
                {result.isError ? 'Error Output' : 'Result'}
              </p>
              <pre className={cn(
                "p-2 bg-muted/40 rounded border border-border/60 text-[10px] font-mono overflow-x-auto max-h-40",
                result.isError ? "text-red-400 border-red-500/20" : "text-primary/80"
              )}>
                {result.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
