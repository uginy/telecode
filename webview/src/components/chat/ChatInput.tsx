import { useState, useRef, useEffect } from 'react';
import { Send, X, File as FileIcon, Folder as FolderIcon, Terminal as TerminalIcon, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore, type SearchResult } from '@/store/useChatStore';
import { cn } from '@/lib/utils';
import { useFileDrop } from '@/hooks/useFileDrop';

interface ChatInputProps {
  onSend: (text: string, contextItems: SearchResult[]) => void;
  onSearch: (query: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, onSearch }) => {
  const [value, setValue] = useState('');
  
  // Use global store for context items
  const contextItems = useChatStore((state) => state.contextItems);
  const setContextItems = useChatStore((state) => state.setContextItems);
  const addContextItem = useChatStore((state) => state.addContextItem);
  const removeContextItem = useChatStore((state) => state.removeContextItem);
  
  const isStreaming = useChatStore((state) => state.isStreaming);
  const searchResults = useChatStore((state) => state.searchResults);
  
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const { isDragging, handleDragOver, handleDragEnter, handleDragLeave, handleDrop } = useFileDrop();
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
     if (showSuggestions) {
         setSelectedIndex(0);
     }
  }, [showSuggestions, searchResults]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setValue(newValue);

      const cursor = e.target.selectionStart;
      const textBeforeCursor = newValue.slice(0, cursor);
      const match = textBeforeCursor.match(/@([\w\-\/\.]*)$/);

      if (match) {
          setShowSuggestions(true);
          const query = match[1];
          onSearch(query);
      } else {
          setShowSuggestions(false);
      }
  };

  const selectItem = (item: SearchResult) => {
      addContextItem(item);
      
      const cursor = textareaRef.current?.selectionStart || 0;
      const textBeforeCursor = value.slice(0, cursor);
      const textAfterCursor = value.slice(cursor);
      const match = textBeforeCursor.match(/@([\w\-\/\.]*)$/);
      
      if (match) {
          const newTextBefore = textBeforeCursor.slice(0, match.index);
          const newValue = newTextBefore + textAfterCursor;
          setValue(newValue);
      }
      
      setShowSuggestions(false);
      textareaRef.current?.focus();
  };

  const removeItem = (itemVal: string) => {
      removeContextItem(itemVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && searchResults.length > 0) {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : searchResults.length - 1));
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            selectItem(searchResults[selectedIndex]);
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
        return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if ((value.trim() || contextItems.length > 0) && !isStreaming) {
        onSend(value, contextItems);
        setValue('');
        setContextItems([]);
      }
    }
  };

  const handleSendClick = () => {
    if ((value.trim() || contextItems.length > 0) && !isStreaming) {
      onSend(value, contextItems);
      setValue('');
      setContextItems([]);
    }
  };

  const getIcon = (type: string) => {
      switch (type) {
          case 'folder': return FolderIcon;
          case 'terminal': return TerminalIcon;
          default: return FileIcon;
      }
  };

  return (
    <footer 
        className="p-2 border-t border-border bg-background/95 backdrop-blur-sm relative"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
    >
       {/* Drop Overlay */}
       {isDragging && (
        <div className="absolute inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-primary rounded-lg animate-in fade-in duration-200 pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-primary animate-bounce">
                <UploadCloud className="w-6 h-6" />
                <span className="font-bold text-xs uppercase tracking-wider">Drop to add context</span>
            </div>
        </div>
       )}

       {/* Context Items Chips */}
       {contextItems.length > 0 && (
           <div className="flex flex-wrap gap-2 mb-2 px-1">
               {contextItems.map(item => {
                   const Icon = getIcon(item.type);
                   return (
                       <span key={item.value} className="flex items-center gap-1 bg-secondary/50 text-xs px-2 py-1 rounded-md border border-border/50 animate-in fade-in zoom-in-0 duration-200">
                           <Icon className="w-3 h-3 opacity-70" />
                           <span className="max-w-[150px] truncate">{item.label}</span>
                           <button type="button" onClick={() => removeItem(item.value)} className="hover:text-destructive">
                               <X className="w-3 h-3" />
                           </button>
                       </span>
                   );
               })}
           </div>
       )}

      {/* Suggestions Popup */}
      {showSuggestions && searchResults.length > 0 && (
          <div className="absolute bottom-full left-2 mb-2 w-72 max-h-64 bg-popover border border-border rounded-lg shadow-lg overflow-y-auto z-50">
              {['file', 'folder', 'terminal'].map(type => {
                  const items = searchResults.filter(r => r.type === type);
                  if (items.length === 0) return null;
                  
                  return (
                      <div key={type}>
                          <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground bg-muted/30 uppercase tracking-wider sticky top-0 backdrop-blur-sm">
                              {type}s
                          </div>
                          {items.map((item) => {
                              const globalIndex = searchResults.indexOf(item);
                              const Icon = getIcon(item.type);
                              return (
                                  <button
                                      type="button"
                                      key={item.value}
                                      onClick={() => selectItem(item)}
                                      className={cn(
                                          "w-full text-left px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground flex items-center gap-2 transition-colors",
                                          globalIndex === selectedIndex && "bg-accent text-accent-foreground"
                                      )}
                                  >
                                      <Icon className="w-3 h-3 opacity-70 shrink-0" />
                                      <div className="flex flex-col overflow-hidden">
                                          <span className="truncate font-medium">{item.label}</span>
                                          {item.type === 'file' && item.label !== item.value && (
                                              <span className="truncate text-[10px] text-muted-foreground">{item.value}</span>
                                          )}
                                      </div>
                                  </button>
                              );
                          })}
                      </div>
                  );
              })}
          </div>
      )}

      <div className="flex items-center gap-2 max-w mx-auto w-full px-1">
        <div className="relative flex-1 group">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? "AIS is thinking..." : "Message AIS Code... (Type @ or drop files)"}
            disabled={isStreaming}
            className="w-full min-h-[40px] max-h-[200px] bg-muted/40 border border-border/50 focus:border-primary/40 focus:bg-muted/40 rounded-xl px-3 py-2.5 text-xs focus:outline-none transition-all resize-none overflow-y-auto placeholder:text-muted-foreground/50 disabled:opacity-50"
            rows={1}
          />
        </div>
        <div className="flex items-center h-[40px] mb-0.5">
          <Button 
            size="sm"
            onClick={handleSendClick}
            disabled={isStreaming || (!value.trim() && contextItems.length === 0)}
            className="h-8 w-8 p-0 font-bold rounded-lg shadow-sm active:scale-90 transition-all bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
          >
            <Send className={cn("w-4 h-4", isStreaming && "animate-pulse")} />
          </Button>
        </div>
      </div>
    </footer>
  );
};
