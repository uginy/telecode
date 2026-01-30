import React from 'react';
import { Send, Terminal as TerminalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ 
  value, 
  onChange, 
  onSend, 
  disabled 
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <footer className="p-3 border-t border-border bg-background">
      <div className="relative flex flex-col gap-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message AIS Code..."
          disabled={disabled}
          className="w-full min-h-[80px] max-h-[300px] bg-muted/20 border border-border focus:border-primary/40 focus:bg-muted/40 rounded-lg px-3 py-2.5 text-xs focus:outline-none transition-all resize-none overflow-y-auto placeholder:text-muted-foreground/50"
          rows={3}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 px-2 text-[10px] gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <TerminalIcon className="w-3.5 h-3.5" />
              Terminal
            </Button>
          </div>
          <Button 
            size="sm"
            onClick={onSend}
            disabled={disabled || !value.trim()}
            className="h-7 px-3 text-[10px] font-bold rounded-md shadow-sm active:scale-95 transition-all"
          >
            Send
            <Send className="w-3 h-3 ml-1.5" />
          </Button>
        </div>
      </div>
    </footer>
  );
};
