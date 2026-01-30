import type React from 'react';
import { cn } from '@/lib/utils';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface MessageItemProps {
  message: Message;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={cn(
      "px-4 py-2 flex flex-col gap-1 transition-colors",
      isUser 
        ? "items-end bg-background" 
        : "items-start border-l-2 border-primary/30 bg-primary/10"
    )}>
      <div className="flex items-center gap-1.5 px-0.5">
        <span className="text-[10px] font-bold tracking-wider uppercase opacity-70 select-none text-foreground/50">
          {isUser ? 'You' : 'AIS'}
        </span>
      </div>
      <div className={cn(
        "text-xs leading-relaxed max-w-[95%] break-words whitespace-pre-wrap",
        isUser 
          ? "text-foreground bg-muted/50 px-3 py-1.5 rounded-2xl rounded-tr-none shadow-sm" 
          : "text-foreground pl-1 font-medium"
      )}>
        {message.content}
      </div>
    </div>
  );
};
