import type React from 'react';
import { useChatStore } from '@/store/useChatStore';
import { cn } from '@/lib/utils';
import { Cpu } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export const ContextUsage: React.FC<{ className?: string }> = ({ className }) => {
  const { usage } = useChatStore();
  
  const percentage = Math.min(100, (usage.used / usage.total) * 100);
  const isHigh = percentage > 80;
  const isCritical = percentage > 95;

  const formatTokens = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
    return n.toString();
  };

  return (
    <div className={cn("flex flex-col gap-1.5 min-w-[140px]", className)}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Cpu className="w-3 h-3" />
          <span>Context</span>
        </div>
        <Badge variant="outline" className="text-[9px] px-2 py-0 border-border/70 text-foreground/70">
          {formatTokens(usage.used)} / {formatTokens(usage.total)}
        </Badge>
      </div>
      <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-500 ease-out rounded-full",
            isCritical ? "bg-red-500" : isHigh ? "bg-orange-500" : "bg-primary"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
