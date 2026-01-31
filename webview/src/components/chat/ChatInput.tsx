import { useState, useRef, useEffect } from 'react';
import { Send, X, File as FileIcon, Folder as FolderIcon, Terminal as TerminalIcon, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useChatStore, type SearchResult } from '@/store/useChatStore';
import { cn } from '@/lib/utils';
import { useFileDrop } from '@/hooks/useFileDrop';

interface ChatInputProps {
  onSend: (text: string, contextItems: SearchResult[]) => void;
  onSearch: (query: string) => void;
  onStop: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, onSearch, onStop }) => {
  const [value, setValue] = useState('');
  
  // Use global store for context items
  const contextItems = useChatStore((state) => state.contextItems);
  const setContextItems = useChatStore((state) => state.setContextItems);
  const addContextItem = useChatStore((state) => state.addContextItem);
  const removeContextItem = useChatStore((state) => state.removeContextItem);
  
  const isStreaming = useChatStore((state) => state.isStreaming);
  const searchResults = useChatStore((state) => state.searchResults);
  
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const SLASH_COMMANDS = [
    { label: '/fix', desc: 'Auto-fix bugs in active file' },
    { label: '/explain', desc: 'Explain active code' },
    { label: '/test', desc: 'Generate unit tests' }
  ];
  
  const { isDragging, handleDragOver, handleDragEnter, handleDragLeave, handleDrop } = useFileDrop();
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
     if (showSuggestions || showCommandMenu) {
         setSelectedIndex(0);
     }
  }, [showSuggestions, showCommandMenu, searchResults]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setValue(newValue);

      const cursor = e.target.selectionStart;
      const textBeforeCursor = newValue.slice(0, cursor);
      
      const mentionMatch = textBeforeCursor.match(/@([\w\-\/\.]*)$/);
      const commandMatch = textBeforeCursor.match(/\/?(\w*)$/);

      if (mentionMatch) {
          setShowSuggestions(true);
          setShowCommandMenu(false);
          onSearch(mentionMatch[1]);
      } else if (commandMatch && newValue.startsWith('/')) {
        // Simple slash command detection at start of line
          setShowSuggestions(false);
          setShowCommandMenu(true);
      } else {
          setShowSuggestions(false);
          setShowCommandMenu(false);
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

  const selectCommand = (cmd: { label: string }) => {
    setValue(cmd.label + ' ');
    setShowCommandMenu(false);
    textareaRef.current?.focus();
  };

  const removeItem = (itemVal: string) => {
      removeContextItem(itemVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((showSuggestions && searchResults.length > 0) || (showCommandMenu && SLASH_COMMANDS.length > 0)) {
        const listLength = showCommandMenu ? SLASH_COMMANDS.length : searchResults.length;
        
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : listLength - 1));
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < listLength - 1 ? prev + 1 : 0));
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            if (showCommandMenu) {
                selectCommand(SLASH_COMMANDS[selectedIndex]);
            } else {
                selectItem(searchResults[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
            setShowCommandMenu(false);
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
        className="p-3 border-t border-border/70 bg-background/80 backdrop-blur-sm relative"
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
           <div className="flex flex-wrap gap-2 mb-3 px-1">
               {contextItems.map(item => {
                   const Icon = getIcon(item.type);
                   return (
                       <Badge key={item.value} variant="secondary" className="gap-1.5 text-[11px] py-1">
                           <Icon className="w-3 h-3 opacity-70" />
                           <span className="max-w-[180px] truncate">{item.label}</span>
                           <button type="button" onClick={() => removeItem(item.value)} className="hover:text-destructive">
                               <X className="w-3 h-3" />
                           </button>
                       </Badge>
                   );
               })}
           </div>
       )}

      {/* Suggestions Popup and Slash Commands */}
      {(showSuggestions && searchResults.length > 0) || (showCommandMenu && SLASH_COMMANDS.length > 0) ? (
          <div className="absolute bottom-full left-2 mb-3 w-72 max-h-64 bg-popover/90 border border-border/70 rounded-2xl shadow-lg overflow-y-auto z-50 animate-in slide-in-from-bottom-2 duration-200">
              
              {/* SLASH COMMANDS */}
              {showCommandMenu && (
                  <div>
                      <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground bg-muted/40 uppercase tracking-[0.3em] sticky top-0 backdrop-blur-sm flex items-center gap-1">
                           <TerminalIcon className="w-3 h-3" /> Commands
                      </div>
                      {SLASH_COMMANDS.filter(cmd => cmd.label.toLowerCase().startsWith(value.match(/\/?(\w*)$/)?.[1]?.toLowerCase() || '')).map((cmd, idx) => (
                           <button
                              type="button"
                              key={cmd.label}
                              onClick={() => selectCommand(cmd)}
                              className={cn(
                                  "w-full text-left px-3 py-2.5 text-[12px] hover:bg-accent hover:text-accent-foreground flex items-center gap-2 transition-colors",
                                  idx === selectedIndex && "bg-accent text-accent-foreground"
                              )}
                          >
                              <div className="flex items-center justify-center w-5 h-5 rounded bg-primary/10 text-primary shrink-0">
                                  <TerminalIcon className="w-3 h-3" />
                              </div>
                              <div className="flex flex-col overflow-hidden">
                                  <span className="truncate font-bold font-mono">{cmd.label}</span>
                                  <span className="truncate text-[10px] text-muted-foreground">{cmd.desc}</span>
                              </div>
                          </button>
                      ))}
                  </div>
              )}

              {/* CONTEXT SUGGESTIONS (Files, etc) */}
              {showSuggestions && !showCommandMenu && ['file', 'folder', 'terminal'].map(type => {
                  const items = searchResults.filter(r => r.type === type);
                  if (items.length === 0) return null;
                  
                  return (
                      <div key={type}>
                          <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground bg-muted/40 uppercase tracking-[0.3em] sticky top-0 backdrop-blur-sm border-t border-border/50 first:border-0">
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
      ) : null}

      <div className="flex items-center gap-2 max-w mx-auto w-full px-1">
        <div className="relative flex-1 group">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? "AIS is thinking..." : "Ask anything. Use @ to attach context."}
            disabled={isStreaming}
            className="w-full min-h-[44px] max-h-[200px] bg-card/60 border border-border/60 focus:border-primary/40 focus:bg-card/70 rounded-2xl px-4 py-3 text-[13px] focus:outline-none transition-all resize-none overflow-y-auto placeholder:text-muted-foreground/60 disabled:opacity-50 shadow-sm"
            rows={1}
          />
        </div>
        <div className="flex items-center h-[40px] mb-0.5">
          {isStreaming ? (
              <Button 
                size="sm"
                onClick={onStop}
                variant="destructive"
                className="h-9 w-9 p-0 font-bold rounded-full shadow-sm active:scale-90 transition-all shrink-0"
              >
                <div className="w-3 h-3 bg-current rounded-sm" />
              </Button>
          ) : (
              <Button 
                size="sm"
                onClick={handleSendClick}
                disabled={!value.trim() && contextItems.length === 0}
                className="h-9 w-9 p-0 font-bold rounded-full shadow-sm active:scale-90 transition-all bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
          )}
        </div>
      </div>
    </footer>
  );
};
