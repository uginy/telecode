import type React from 'react';
import { useState, useRef, useEffect } from 'react';
import { Search, Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from './scroll-area';

interface Option {
  id: string;
  label: string;
  description?: string;
  isFree?: boolean;
}

interface ComboboxProps {
  options: Option[];
  value: string;
  onSelect: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
}

export const Combobox: React.FC<ComboboxProps> = ({ 
  options, 
  value, 
  onSelect, 
  placeholder = "Select option...", 
  emptyText = "No results found.",
  className 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.id === value);
  const filteredOptions = options.filter(o => 
    o.label.toLowerCase().includes(search.toLowerCase()) || 
    o.id.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full p-2.5 bg-black/40 border border-white/10 rounded-lg hover:border-primary/50 transition-all cursor-pointer group"
      >
        <div className="flex-1 min-w-0">
          {selectedOption ? (
            <div className="flex flex-col">
              <span className="text-xs font-bold truncate">{selectedOption.label}</span>
              {selectedOption.description && (
                <span className="text-[10px] text-muted-foreground truncate">{selectedOption.description}</span>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">{placeholder}</span>
          )}
        </div>
        <ChevronDown className={cn("w-4 h-4 opacity-40 group-hover:opacity-100 transition-all", isOpen && "rotate-180")} />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center px-3 border-b border-white/5 bg-white/5">
            <Search className="w-4 h-4 opacity-40 shrink-0" />
            <input 
              className="w-full p-3 bg-transparent text-xs focus:outline-none placeholder:text-muted-foreground/50"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button 
                onClick={() => setSearch("")}
                className="p-1 hover:bg-white/10 rounded-full transition-colors"
                type="button"
              >
                <X className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
              </button>
            )}
          </div>
          
          <ScrollArea className="max-h-60">
            <div className="p-1.5 space-y-0.5">
              {filteredOptions.length === 0 ? (
                <p className="p-4 text-[11px] text-center text-muted-foreground italic">{emptyText}</p>
              ) : (
                filteredOptions.map(option => (
                  <div 
                    key={option.id}
                    onClick={() => {
                      onSelect(option.id);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all hover:bg-white/5",
                      value === option.id ? "bg-primary/10 text-primary" : "text-foreground/80"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold truncate">{option.label}</span>
                        {option.isFree && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary text-black font-black uppercase tracking-tighter">Free</span>
                        )}
                      </div>
                      {option.description && (
                        <p className="text-[10px] opacity-60 truncate">{option.description}</p>
                      )}
                    </div>
                    {value === option.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
};
