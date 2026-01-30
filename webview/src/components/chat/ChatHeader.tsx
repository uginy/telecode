import type React from 'react';
import { Plus, Settings, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useChatStore } from '@/store/useChatStore';
import { ContextUsage } from './ContextUsage';

export const ChatHeader: React.FC = () => {
  const { clearHistory, setView } = useChatStore();

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
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearHistory}>
              <Plus className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>New Chat</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <History className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>History</TooltipContent>
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
