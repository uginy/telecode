import type React from 'react';
import { Plus, Settings, History, ShieldCheck, ShieldOff, Search } from 'lucide-react';
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
    <header className="flex items-center justify-between px-3 py-2 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold tracking-tight text-foreground/80">AIS CODE</span>
      </div>

      <div className="flex-1 flex justify-center max-w-[200px] px-4">
        <ContextUsage className="w-full" />
      </div>

      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNewChat}>
              <Plus className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>New Chat</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleHistory}>
              <History className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>History</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleContext}>
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
              className={sessionAllowAllTools ? "h-8 w-8 text-emerald-400" : "h-8 w-8"}
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
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setView('settings')}>
              <Settings className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>Settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
};
