
import type React from 'react';

export const ThinkingBubble: React.FC = () => {
  return (
    <div className="px-4 py-2 flex flex-col gap-1 w-full items-start border-l-2 border-primary/30 bg-primary/10 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-1.5 px-0.5 mt-1 w-full relative justify-start">
        <span className="text-[10px] font-bold tracking-wider uppercase opacity-70 select-none text-foreground/50">
          AIS
        </span>
      </div>
      <div className="text-xs leading-relaxed break-words w-full flex items-center gap-1 h-5 pl-1">
        <span className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
        <span className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
        <span className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-bounce"></span>
      </div>
    </div>
  );
};
