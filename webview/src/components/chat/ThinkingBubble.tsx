
import type React from 'react';

export const ThinkingBubble: React.FC<{ status?: string }> = ({ status }) => {
  return (
    <div className="px-4 py-1 flex flex-col gap-2 w-full items-start animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2 w-full">
        <span className="text-[10px] font-semibold tracking-[0.3em] uppercase text-muted-foreground">
          AIS
        </span>
        {status ? (
          <span className="text-[11px] text-foreground/70">{status}</span>
        ) : null}
      </div>
      <div className="rounded-2xl border border-border/60 bg-card/60 px-4 py-3 shadow-sm w-full">
        <div className="text-xs leading-relaxed break-words w-full flex items-center gap-1 h-5 pl-1">
        <span className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
        <span className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
        <span className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce"></span>
        </div>
      </div>
    </div>
  );
};
