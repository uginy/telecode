import type React from 'react';
import { useState } from 'react';
import { 
  FileText, Terminal, FolderTree, ChevronDown, ChevronRight, 
  CheckCircle2, XCircle, Loader2 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolResult } from './MessageItem';

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
      case 'list_files': return <FolderTree className="w-3.5 h-3.5" />;
      case 'run_command': return <Terminal className="w-3.5 h-3.5" />;
      default: return <Terminal className="w-3.5 h-3.5" />;
    }
  };

  const getLabel = () => {
    switch (name) {
      case 'write_file': return `Write ${args.path}`;
      case 'read_file': return `Read ${args.path}`;
      case 'list_files': return `List ${args.path}`;
      case 'run_command': return `Run: ${args.command}`;
      default: return name;
    }
  };

  const getStatusIcon = () => {
    if (isStreaming || !result) return <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />;
    if (result.isError) return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
  };

  return (
    <div className="my-2 border border-white/5 rounded-lg overflow-hidden bg-black/20 backdrop-blur-sm animate-in fade-in slide-in-from-left-2 duration-300">
      <div 
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors group"
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => e.key === 'Enter' && setIsExpanded(!isExpanded)}
        tabIndex={0}
        role="button"
      >
        <div className="opacity-60 group-hover:opacity-100 transition-opacity">
          {getIcon()}
        </div>
        
        <span className="flex-1 text-[11px] font-bold truncate opacity-80">
          {getLabel()}
        </span>
        
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          {isExpanded ? <ChevronDown className="w-3 h-3 opacity-40" /> : <ChevronRight className="w-3 h-3 opacity-40" />}
        </div>
      </div>
      
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-white/5 animate-in slide-in-from-top-1 duration-200">
          {/* Action Arguments */}
          {name === 'write_file' && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Content</p>
              <pre className="p-2 bg-black/40 rounded border border-white/5 text-[10px] font-mono overflow-x-auto max-h-40">
                {args.content}
              </pre>
            </div>
          )}
          
          {/* Tool Result */}
          {result && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {result.isError ? 'Error Output' : 'Result'}
              </p>
              <pre className={cn(
                "p-2 bg-black/40 rounded border border-white/5 text-[10px] font-mono overflow-x-auto max-h-40",
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
