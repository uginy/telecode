import type React from 'react';
import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/useChatStore';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (text: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend }) => {
  const [value, setValue] = useState('');
  const isStreaming = useChatStore((state) => state.isStreaming);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isStreaming) {
        onSend(value);
        setValue('');
      }
    }
  };

  const handleSendClick = () => {
    if (value.trim() && !isStreaming) {
      onSend(value);
      setValue('');
    }
  };

  return (
    <footer className="p-2 border-t border-border bg-background/95 backdrop-blur-sm">
      <div className="flex gap-2 max-w-3xl mx-auto w-full px-1 align-center items-center">
        <div className="relative flex-1 group">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? "AIS is thinking..." : "Message AIS Code..."}
            disabled={isStreaming}
            className="w-full min-h-[40px] max-h-[200px] bg-muted/20 border border-border/50 focus:border-primary/40 focus:bg-muted/40 rounded-xl px-3 py-2.5 text-xs focus:outline-none transition-all resize-none overflow-y-auto placeholder:text-muted-foreground/30 disabled:opacity-50"
            rows={1}
          />
        </div>
        <div className="flex items-center h-[40px] mb-0.5">
          <Button 
            size="sm"
            onClick={handleSendClick}
            disabled={isStreaming || !value.trim()}
            className="h-8 w-8 p-0 font-bold rounded-lg shadow-sm active:scale-90 transition-all bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
          >
            <Send className={cn("w-4 h-4", isStreaming && "animate-pulse")} />
          </Button>
        </div>
      </div>
    </footer>
  );
};
