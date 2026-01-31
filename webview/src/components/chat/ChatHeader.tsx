import type React from 'react';
import { Plus, Settings, History, ShieldCheck, ShieldOff, Search, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useChatStore } from '@/store/useChatStore';
import { ContextUsage } from './ContextUsage';

export const ChatHeader: React.FC = () => {
  const { setView, sessionAllowAllTools, setSessionAllowAllTools } = useChatStore();

  const handleNewChat = () => {
    if ((window as any).vscode) {
      (window as any).vscode.postMessage({ type: 'createSession' });
    }
  };

  const handleHistory = () => {
    setView('history');
  };

  const handleContext = () => {
    setView('context');
  };

  const handleToggleToolApproval = () => {
    const nextValue = !sessionAllowAllTools;
    setSessionAllowAllTools(nextValue);
    if ((window as any).vscode) {
      (window as any).vscode.postMessage({
        type: 'setSessionToolApprovals',
        allowAll: nextValue
      });
    }
  };

  return (
    <header className="flex items-center justify-between px-4 py-2.5 border-b border-border/70 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/40 sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shadow-sm">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex flex-col leading-tight">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold tracking-[0.28em] text-muted-foreground uppercase">
              AIS CODE
            </span>
            <Badge variant="outline" className="text-[9px] tracking-[0.35em] uppercase border-primary/30 text-primary/80">
              studio
            </Badge>
          </div>
          <span className="text-[11px] text-muted-foreground/80">Cline‑level, your style.</span>
        </div>
      </div>

      <div className="flex-1 flex justify-center max-w-[260px] px-4">
        <ContextUsage className="w-full" />
      </div>

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={handleNewChat}>
              <Plus className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>New Chat</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={handleHistory}>
              <History className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>History</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={handleContext}>
              <Search className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>Context</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={sessionAllowAllTools ? "h-8 w-8 rounded-full text-emerald-400" : "h-8 w-8 rounded-full"}
              onClick={handleToggleToolApproval}
            >
              {sessionAllowAllTools ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            {sessionAllowAllTools ? 'Tools allowed for this chat' : 'Allow tools for this chat'}
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-4" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setView('settings')}>
              <Settings className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>Settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
};
