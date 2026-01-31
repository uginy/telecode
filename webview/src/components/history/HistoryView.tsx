
import type React from 'react';
import { ArrowLeft, MessageSquare, Trash2, Clock } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils'; // Assuming this exists or similar util

export const HistoryView: React.FC = () => {
  const { sessions, activeSessionId, setView } = useChatStore();

  const handleBack = () => {
    setView('chat');
  };

  const handleSelectSession = (sessionId: string) => {
    if ((window as any).vscode) {
      (window as any).vscode.postMessage({ type: 'loadSession', sessionId });
    }
    setView('chat');
  };

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if ((window as any).vscode) {
      (window as any).vscode.postMessage({ type: 'deleteSession', sessionId });
    }
  };

  // Sort sessions by updatedAt desc
  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-sm font-semibold">Chat History</h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {sortedSessions.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">
              No chat history found.
            </div>
          ) : (
            sortedSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => handleSelectSession(session.id)}
                className={cn(
                  "group flex flex-col gap-1 p-3 rounded-lg border transition-all cursor-pointer hover:bg-muted/50",
                  activeSessionId === session.id 
                    ? "bg-muted border-primary/20" 
                    : "bg-card border-border"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageSquare className={cn(
                      "w-4 h-4 mt-0.5 flex-shrink-0",
                      activeSessionId === session.id ? "text-primary" : "text-muted-foreground"
                    )} />
                    <span className={cn(
                      "text-sm font-medium truncate",
                      activeSessionId === session.id ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {session.title || 'New Chat'}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity -mr-1"
                    onClick={(e) => handleDeleteSession(e, session.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
                
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pl-6">
                  <Clock className="w-3 h-3" />
                  <span>
                    {new Date(session.updatedAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
