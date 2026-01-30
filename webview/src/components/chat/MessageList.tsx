import React, { useRef, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageItem, type Message } from './MessageItem';

interface MessageListProps {
  messages: Message[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]); // Changed to full messages array to satisfy linter

  if (messages.length === 0) {
    return (
      <ScrollArea className="flex-1">
        <div className="flex flex-col items-center justify-center text-center p-8 space-y-4 min-h-[300px]">
          <Sparkles className="w-10 h-10 text-primary opacity-20 animate-pulse" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground/90 tracking-tight">How can I help you?</h2>
            <p className="text-[11px] text-muted-foreground max-w-[180px] mx-auto leading-relaxed">
              I can build, fix, and explain code in this workspace.
            </p>
          </div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-0 py-2">
        {messages.map((msg) => (
          <MessageItem key={msg.id} message={msg} />
        ))}
        <div ref={scrollRef} className="h-6" />
      </div>
    </ScrollArea>
  );
};
