import type React from 'react';
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/useChatStore';
import type { Message, ToolResult } from './messageTypes';

type ToolCallEntry = {
  name: string;
  args: Record<string, string>;
};

const TOOL_REGEX =
  /<(write_file|replace_in_file|read_file|list_files|run_command|search_files|codebase_search|get_problems)(?:\s+path\s*=\s*"([^"]*)")?\s*>([\s\S]*?)<\/\1>/g;
const SELF_CLOSING_REGEX =
  /<(read_file|list_files|get_problems)\s+path\s*=\s*"([^"]*)"\s*\/>/g;

const parseToolCalls = (content: string): ToolCallEntry[] => {
  const entries: ToolCallEntry[] = [];
  let match: RegExpExecArray | null;

  while ((match = TOOL_REGEX.exec(content)) !== null) {
    const tagName = match[1];
    const path = match[2];
    const innerContent = match[3] ?? '';

    const args: Record<string, string> = {};
    const trimmedContent = innerContent.trim();
    if (path) {
      args.path = path;
    } else if (trimmedContent && (tagName === 'read_file' || tagName === 'list_files' || tagName === 'get_problems')) {
      args.path = trimmedContent;
    } else if (tagName === 'list_files') {
      args.path = '.';
    }
    if (tagName === 'run_command') args.command = innerContent;
    if (tagName === 'write_file' || tagName === 'replace_in_file') args.content = innerContent;
    if (tagName === 'search_files') args.query = innerContent;
    if (tagName === 'codebase_search') {
      const trimmed = innerContent.trim();
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed) as { query?: string; path?: string };
          if (parsed.query) args.query = parsed.query;
          if (parsed.path) args.path = parsed.path;
        } catch {
          args.query = innerContent;
        }
      } else {
        args.query = innerContent;
      }
    }

    entries.push({ name: tagName, args });
  }

  while ((match = SELF_CLOSING_REGEX.exec(content)) !== null) {
    const tagName = match[1];
    const path = match[2];
    const args: Record<string, string> = {};
    if (path) {
      args.path = path;
    } else if (tagName === 'list_files') {
      args.path = '.';
    }
    entries.push({ name: tagName, args });
  }

  return entries;
};

const getLabel = (name: string, args: Record<string, string>) => {
  switch (name) {
    case 'write_file':
      return `Write ${args.path ?? ''}`.trim();
    case 'read_file':
      return args.path ? `Read ${args.path}` : 'Read (missing path)';
    case 'replace_in_file':
      return `Edit ${args.path ?? ''}`.trim();
    case 'list_files':
      return `List ${args.path ?? '.'}`.trim();
    case 'search_files':
      return `Search: ${args.query ?? ''}`;
    case 'codebase_search':
      return `Semantic search: ${args.query ?? ''}`;
    case 'run_command':
      return `Run: ${args.command ?? ''}`;
    case 'get_problems':
      return `Check Issues${args.path ? `: ${args.path}` : ''}`;
    default:
      return name;
  }
};

export const ToolTimeline: React.FC = () => {
  const messages = useChatStore((state) => state.messages);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const latestAssistant = useMemo<Message | null>(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'assistant') return messages[i];
    }
    return null;
  }, [messages]);

  const toolCalls = useMemo(() => {
    if (!latestAssistant?.content) return [];
    return parseToolCalls(latestAssistant.content);
  }, [latestAssistant]);

  const results = useMemo(() => {
    if (!latestAssistant?.toolResults) return [];
    return Object.values(latestAssistant.toolResults) as ToolResult[];
  }, [latestAssistant]);

  if (!latestAssistant || toolCalls.length === 0) return null;

  const entries = toolCalls.map((call, index) => ({
    ...call,
    result: results[index],
  }));

  const counts = entries.reduce(
    (acc, entry) => {
      if (!entry.result) {
        acc.pending += 1;
      } else if (entry.result.isError) {
        acc.error += 1;
      } else {
        acc.success += 1;
      }
      return acc;
    },
    { success: 0, error: 0, pending: 0 },
  );

  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Tool timeline
          </CardTitle>
          <div className="flex items-center gap-2">
            {counts.success > 0 && (
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
                {counts.success} ok
              </Badge>
            )}
            {counts.error > 0 && (
              <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400">
                {counts.error} error
              </Badge>
            )}
            {(counts.pending > 0 || isStreaming) && (
              <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                {isStreaming ? 'running' : `${counts.pending} pending`}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-col gap-3">
          {entries.map((entry, index) => {
            const isExpanded = !!expanded[index];
            const status = entry.result
              ? entry.result.isError
                ? 'error'
                : 'success'
              : isStreaming
                ? 'running'
                : 'pending';

            return (
              <div key={`${entry.name}-${index}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      'h-7 w-7 rounded-full border flex items-center justify-center',
                      status === 'success' && 'border-emerald-500/40 text-emerald-400',
                      status === 'error' && 'border-red-500/40 text-red-400',
                      status === 'running' && 'border-primary/40 text-primary',
                      status === 'pending' && 'border-border/60 text-muted-foreground',
                    )}
                  >
                    {status === 'success' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {status === 'error' && <AlertTriangle className="w-3.5 h-3.5" />}
                    {status === 'running' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {status === 'pending' && <Search className="w-3.5 h-3.5" />}
                  </div>
                  {index < entries.length - 1 && (
                    <div className="w-px flex-1 bg-border/70 mt-2" />
                  )}
                </div>

                <div className="flex-1 rounded-2xl border border-border/70 bg-muted/30 px-3 py-2.5">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 text-left"
                    onClick={() => setExpanded((prev) => ({ ...prev, [index]: !isExpanded }))}
                  >
                    <span className="text-[12px] font-semibold text-foreground/80 truncate">
                      {getLabel(entry.name, entry.args)}
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 space-y-2 text-[11px] text-muted-foreground">
                      {Object.keys(entry.args).length > 0 && (
                        <pre className="rounded-lg border border-border/70 bg-card/80 p-2 font-mono text-[10px] text-foreground/80 max-h-40 overflow-auto">
                          {JSON.stringify(entry.args, null, 2)}
                        </pre>
                      )}
                      {entry.result && (
                        <pre
                          className={cn(
                            'rounded-lg border border-border/70 bg-card/80 p-2 font-mono text-[10px] max-h-40 overflow-auto',
                            entry.result.isError ? 'text-red-400' : 'text-foreground/80',
                          )}
                        >
                          {entry.result.output}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
