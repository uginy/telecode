import type React from 'react';
import { useState } from 'react';
import { Send, Terminal as TerminalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/useChatStore';

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
    <footer className="p-3 border-t border-border bg-background">
      <div className="relative flex flex-col gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? "AIS is thinking..." : "Message AIS Code..."}
          disabled={isStreaming}
          className="w-full min-h-[80px] max-h-[300px] bg-muted/20 border border-border focus:border-primary/40 focus:bg-muted/40 rounded-lg px-3 py-2.5 text-xs focus:outline-none transition-all resize-none overflow-y-auto placeholder:text-muted-foreground/50 disabled:opacity-50"
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
            onClick={handleSendClick}
            disabled={isStreaming || !value.trim()}
            className="h-7 px-3 text-[10px] font-bold rounded-md shadow-sm active:scale-95 transition-all"
          >
            {isStreaming ? "Thinking" : "Send"}
            <Send className="w-3 h-3 ml-1.5" />
          </Button>
        </div>
      </div>
    </footer>
  );
};
