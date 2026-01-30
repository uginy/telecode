import type React from 'react';
import { useState } from 'react';
import { 
  Settings, Globe, ChevronRight, Sparkles, Terminal, Info,
  SlidersHorizontal, ChevronDown, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChatStore } from '@/store/useChatStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type SettingsTab = 'api' | 'features' | 'browser' | 'terminal' | 'general' | 'about';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, setView } = useChatStore();
  const [localSettings, setLocalSettings] = useState(settings);
  const [activeTab, setActiveTab] = useState<SettingsTab>('api');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const handleSave = () => {
    updateSettings(localSettings);
    vscode.postMessage({
      type: 'updateSettings',
      settings: localSettings
    });
    setView('chat');
  };

  const NavItem: React.FC<{ 
    id: SettingsTab, 
    label: string, 
    icon: React.ElementType 
  }> = ({ id, label, icon: Icon }) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium transition-all whitespace-nowrap",
        activeTab === id 
          ? "bg-accent text-foreground border-l-2 border-primary" 
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border-l-2 border-transparent"
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {activeTab === id && <ChevronRight className="w-3 h-3 opacity-30" />}
    </button>
  );

  return (
    <div className="flex flex-col h-screen bg-[#111111] text-foreground font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h1 className="text-sm font-bold tracking-tight">Settings</h1>
        <Button 
          variant="secondary" 
          size="sm" 
          className="h-7 px-4 text-xs font-bold rounded bg-white/10 hover:bg-white/15 border-0"
          onClick={handleSave}
        >
          Done
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-48 border-r border-white/5 bg-black/20 flex flex-col shrink-0">
          <nav className="flex-1 py-1">
            <NavItem id="api" label="API Configuration" icon={SlidersHorizontal} />
            <NavItem id="features" label="Features" icon={Sparkles} />
            <NavItem id="browser" label="Browser" icon={Globe} />
            <NavItem id="terminal" label="Terminal" icon={Terminal} />
            <NavItem id="general" label="General" icon={Settings} />
            <NavItem id="about" label="About" icon={Info} />
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a]">
          <ScrollArea className="flex-1">
            <div className="p-6 max-w-4xl space-y-8 animate-in fade-in duration-300">
              
              {activeTab === 'api' && (
                <div className="space-y-6">
                  <header className="flex items-center gap-2 text-muted-foreground mb-4">
                    <SlidersHorizontal className="w-4 h-4" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">API Configuration</h2>
                  </header>

                  {/* API Provider */}
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-foreground/90">API Provider</label>
                    <div className="relative group max-w-md">
                      <Input 
                        value={localSettings.provider}
                        onChange={(e) => setLocalSettings({...localSettings, provider: e.target.value})}
                        className="bg-black/40 border-white/10 focus:border-primary/50 text-sm h-10"
                        placeholder="OpenRouter"
                      />
                    </div>
                    <Button variant="secondary" size="sm" className="h-8 px-4 text-[11px] bg-white/5 hover:bg-white/10 border-0 font-medium opacity-80">
                      View Billing & Usage
                    </Button>
                  </div>

                  {/* Model Selection */}
                  <div className="space-y-4 pt-2">
                    <label className="text-[12px] font-bold text-foreground/90">Model</label>
                    
                    {/* Model Tabs */}
                    <div className="flex gap-6 border-b border-white/5">
                      <button type="button" className="text-[11px] font-bold pb-2 border-b-2 border-transparent opacity-40 hover:opacity-100 transition-all">Recommended</button>
                      <button type="button" className="text-[11px] font-bold pb-2 border-b-2 border-primary text-primary transition-all">Free</button>
                    </div>

                    {/* Model List Mock */}
                    <div className="space-y-1">
                      {[
                        { id: 'kwaipilot/kat-coder-pro', label: 'kwaipilot/kat-coder-pro', desc: "KwaiKAT's most advanced agentic coding model" },
                        { id: 'arcee-ai/trinity-large-preview:free', label: 'arcee-ai/trinity-large-preview:free', desc: "Arcee AI's advanced large preview model", active: true },
                        { id: 'stealth/giga-potato', label: 'stealth/giga-potato', desc: "A stealth model for coding (may underperform)" }
                      ].map(model => (
                        <div key={model.id} className={cn(
                          "p-2 rounded-md border text-left cursor-pointer transition-all",
                          model.active ? "border-primary bg-primary/5 shadow-[0_0_10px_rgba(var(--primary),0.1)]" : "border-white/5 hover:bg-white/5 bg-transparent"
                        )}>
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="text-[11px] font-bold font-mono">{model.label}</span>
                            <span className="text-[9px] font-bold text-primary tracking-tighter uppercase">Free</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{model.desc}</p>
                        </div>
                      ))}
                    </div>

                    {/* Model Input */}
                    <div className="relative group max-w-md">
                      <Input 
                        value={localSettings.modelId}
                        onChange={(e) => setLocalSettings({...localSettings, modelId: e.target.value})}
                        className="bg-black/40 border-white/10 focus:border-primary/50 text-xs font-mono h-10 pr-10"
                        placeholder="arcee-ai/trinity-large-preview:free"
                      />
                      <X className="absolute right-3 top-3 w-4 h-4 opacity-40 hover:opacity-100 cursor-pointer" onClick={() => setLocalSettings({...localSettings, modelId: ''})} />
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed italic opacity-80">
                      Trinity-Large-Preview is a frontier-scale open-weight language model from Arcee... 
                      <span className="text-primary cursor-pointer hover:underline ml-1">See more</span>
                    </p>

                    <div className="flex gap-4 text-[10px] font-bold uppercase tracking-tight opacity-60">
                      <span>Context: <span className="text-foreground">131K</span></span>
                      <span>Input: <span className="text-primary">Free</span></span>
                      <span>Output: <span className="text-primary">Free</span></span>
                    </div>
                  </div>

                  {/* Advanced Settings */}
                  <div className="pt-4">
                    <button 
                      type="button"
                      onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                      className="flex items-center gap-1.5 text-[11px] font-bold text-foreground/80 hover:text-foreground transition-colors uppercase tracking-widest"
                    >
                      {isAdvancedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      Advanced
                    </button>

                    {isAdvancedOpen && (
                      <div className="mt-4 space-y-6 pl-2 animate-in slide-in-from-top-2 duration-200">
                        <div className="flex items-start gap-3 p-1 rounded-lg group cursor-pointer">
                          <div className="h-4 w-4 rounded border border-white/20 bg-white/5 mt-0.5 group-hover:border-primary/50 transition-colors" />
                          <div className="space-y-1">
                            <p className="text-[11px] font-bold">Use different models for Plan and Act modes</p>
                            <p className="text-[10px] text-muted-foreground leading-normal max-w-md opacity-70">
                              Switching between Plan and Act mode will persist the API and model used in the previous mode.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8 max-w-md">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">Temperature</label>
                            <Input 
                              type="number" step="0.1"
                              value={localSettings.temperature}
                              onChange={(e) => setLocalSettings({...localSettings, temperature: Number.parseFloat(e.target.value)})}
                              className="bg-black/40 border-white/10 h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">Max Tokens</label>
                            <Input 
                              type="number"
                              value={localSettings.maxTokens}
                              onChange={(e) => setLocalSettings({...localSettings, maxTokens: Number.parseInt(e.target.value)})}
                              className="bg-black/40 border-white/10 h-8 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab !== 'api' && (
                <div className="flex flex-col items-center justify-center py-32 opacity-20 select-none">
                  {activeTab === 'features' && <Sparkles className="w-16 h-16 mb-4" />}
                  {activeTab === 'browser' && <Globe className="w-16 h-16 mb-4" />}
                  {activeTab === 'terminal' && <Terminal className="w-16 h-16 mb-4" />}
                  {activeTab === 'general' && <Settings className="w-16 h-16 mb-4" />}
                  {activeTab === 'about' && <Info className="w-16 h-16 mb-4" />}
                  <p className="text-lg font-bold tracking-tighter">Under Construction</p>
                  <p className="text-xs italic">These settings will be available in the next core update.</p>
                </div>
              )}

            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
};

declare const vscode: {
  postMessage: (message: unknown) => void;
};
