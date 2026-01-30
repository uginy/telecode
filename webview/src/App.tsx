import React, { useState, useEffect, useRef } from 'react';
import { Send, Plus, Settings, History, Terminal as TerminalIcon, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

declare const vscode: {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'streamToken':
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, content: last.content + message.text }];
            }
            return [...prev, { id: crypto.randomUUID(), role: 'assistant', content: message.text }];
          });
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    
    const newUserMsg: Message = { 
      id: crypto.randomUUID(),
      role: 'user', 
      content: inputValue 
    };
    
    setMessages(prev => [...prev, newUserMsg]);
    setInputValue('');
    
    vscode.postMessage({ type: 'sendMessage', text: inputValue });
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-primary/30">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/30 backdrop-blur-xl sticky top-0 z-20">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-inner">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight leading-none">AIS CODE</h1>
              <p className="text-[10px] text-muted-foreground mt-1 font-medium tracking-wider uppercase">Advanced Agent</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
                  <Plus className="w-4.5 h-4.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">New Chat</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
                  <History className="w-4.5 h-4.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">History</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="mx-1 h-4" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
                  <Settings className="w-4.5 h-4.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Settings</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4">
          <div className="py-6 space-y-6 max-w-2xl mx-auto">
            {messages.length === 0 ? (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 animate-pulse" />
                  <Shield className="w-20 h-20 text-primary relative z-10" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-extrabold tracking-tight">Full Autonomy Agent</h2>
                  <p className="text-muted-foreground text-sm max-w-[280px] leading-relaxed">
                    I can analyze your project, run commands, and edit files directly in your workspace.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 pt-4">
                  <Badge variant="secondary" className="px-3 py-1 font-medium bg-primary/5 border-primary/10">Read Logs</Badge>
                  <Badge variant="secondary" className="px-3 py-1 font-medium bg-primary/5 border-primary/10">Fix Errors</Badge>
                  <Badge variant="secondary" className="px-3 py-1 font-medium bg-primary/5 border-primary/10">Write Code</Badge>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={cn("flex flex-col group animate-in fade-in slide-in-from-bottom-2 duration-300", msg.role === 'user' ? "items-end" : "items-start")}>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-2 ml-1">
                      <div className="w-5 h-5 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Shield className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-[10px] font-bold tracking-widest uppercase text-primary/80">Agent</span>
                    </div>
                  )}
                  <div className={cn(
                    "px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm block break-words max-w-[90%]",
                    msg.role === 'user' 
                      ? "bg-primary text-primary-foreground font-medium rounded-tr-none shadow-primary/20" 
                      : "bg-card text-foreground border border-border rounded-tl-none"
                  )}>
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <footer className="p-4 bg-background/80 backdrop-blur-lg border-t border-border">
          <div className="max-w-2xl mx-auto">
            <div className="relative group transition-all">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Tell me what to build or fix..."
                className="min-h-[60px] max-h-48 w-full bg-secondary/50 border border-border focus:border-primary/50 focus:bg-secondary/80 rounded-2xl px-4 py-4 pr-14 text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all resize-none shadow-inner"
                rows={1}
              />
              <Button 
                size="icon"
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className="absolute right-2.5 bottom-2.5 h-9 w-9 rounded-xl shadow-lg transition-all hover:scale-105 active:scale-95"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between mt-3 px-1">
              <div className="flex items-center gap-3">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 font-medium">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span>ONLINE</span>
                </div>
                <Separator orientation="vertical" className="h-3" />
                <div className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium hover:text-foreground cursor-pointer transition-colors">
                  <TerminalIcon className="w-3 h-3" />
                  <span>TERMINAL</span>
                </div>
              </div>
              <div className="text-[10px] font-bold text-muted-foreground tracking-tight">
                CLAUDE 3.5 SONNET
              </div>
            </div>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
};

export default App;
