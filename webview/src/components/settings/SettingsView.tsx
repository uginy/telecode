import type React from 'react';
import { useState } from 'react';
import { 
  Settings, Globe, ChevronRight, Sparkles, Terminal, Info,
  SlidersHorizontal, Eye, EyeOff, ExternalLink, Cpu
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useChatStore } from '@/store/useChatStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Combobox } from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PROVIDERS, getProviderById } from '@/config/providers';

type SettingsTab = 'api' | 'features' | 'browser' | 'terminal' | 'general' | 'about';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, setView, updateUsage, usage } = useChatStore();
  const [localSettings, setLocalSettings] = useState(settings);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isShowKey, setIsShowKey] = useState(false);
  const [isFreeOnly, setIsFreeOnly] = useState(false);

  const handleSave = () => {
    const hasChanges = JSON.stringify(settings) !== JSON.stringify(localSettings);
    
    // Find selected model context limit to update usage
    const selectedProvider = getProviderById(localSettings.provider);
    const selectedModel = selectedProvider?.models.find(m => m.id === localSettings.modelId);

    if (selectedModel?.contextLimit) {
        updateUsage({ used: usage.used, total: selectedModel.contextLimit });
    }

    if (hasChanges) {
      updateSettings(localSettings);
      if ((window as any).vscode) {
          (window as any).vscode.postMessage({
            type: 'updateSettings',
            settings: localSettings
          });
      }
    }
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

  const selectedProvider = getProviderById(localSettings.provider);
  const providerModels = selectedProvider?.models || [];
  const filteredModels = isFreeOnly 
    ? providerModels.filter(m => m.isFree) 
    : providerModels;

  const selectedModel = providerModels.find(m => m.id === localSettings.modelId);

  return (
    <div className="flex flex-col h-screen bg-[#111111] text-foreground font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-black/20">
        <h1 className="text-sm font-bold tracking-tight text-foreground/90 uppercase tracking-[0.1em]">AIS Code Configuration</h1>
        <Button 
          variant="secondary" 
          size="sm" 
          className="h-7 px-4 text-xs font-bold rounded-lg bg-white/10 hover:bg-white/15 border-0 transition-all hover:scale-105 active:scale-95"
          onClick={handleSave}
        >
          Done
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-48 border-r border-white/5 bg-black/40 flex flex-col shrink-0">
          <nav className="flex-1 py-3 px-1.5 space-y-0.5">
            <NavItem id="general" label="General" icon={Settings} />
            <NavItem id="api" label="API Configuration" icon={SlidersHorizontal} />
            <NavItem id="features" label="Features" icon={Sparkles} />
            <NavItem id="browser" label="Browser" icon={Globe} />
            <NavItem id="terminal" label="Terminal" icon={Terminal} />
            <NavItem id="about" label="About" icon={Info} />
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#0a0a0a]">
          <ScrollArea className="h-full">
            <div className="p-8 max-w-2xl mx-auto w-full space-y-12 animate-in fade-in duration-500">
              
              {activeTab === 'api' && (
                <div className="space-y-10">
                  <header>
                    <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                      <SlidersHorizontal className="w-6 h-6 text-primary" />
                      API Configuration
                    </h2>
                    <p className="text-[11px] font-medium text-muted-foreground mt-1.5 opacity-50 uppercase tracking-widest">Connect your favorite AI minds</p>
                  </header>

                  {/* Provider Selection */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.2em]">Primary AI Provider</label>
                    <Combobox 
                      options={PROVIDERS.map(p => ({
                        id: p.id,
                        label: p.label,
                        description: p.description
                      }))}
                      value={localSettings.provider || ''}
                      onSelect={(id) => {
                        const newProvider = getProviderById(id);
                        setLocalSettings({
                          ...localSettings, 
                          provider: id,
                          modelId: newProvider?.models[0]?.id || '' 
                        });
                      }}
                      placeholder="Search providers..."
                    />
                  </div>

                  {/* API Key - Contextual */}
                  {selectedProvider && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.2em] flex items-center gap-2">
                          <selectedProvider.icon className="w-4 h-4 text-primary opacity-60" />
                          {selectedProvider.label} API Access
                        </label>
                        <a 
                          href={selectedProvider.apiKeyUrl} 
                          target="_blank" rel="noreferrer" 
                          className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1.5 transition-all hover:opacity-100 opacity-70"
                        >
                          Legacy Dashboard <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <div className="relative">
                        <Input 
                          type={isShowKey ? "text" : "password"}
                          value={localSettings.apiKey || ''}
                          onChange={(e) => setLocalSettings({...localSettings, apiKey: e.target.value})}
                          className="bg-black/40 border-white/5 h-12 text-xs font-mono pr-12 rounded-2xl focus:border-primary/40 transition-all placeholder:opacity-20"
                          placeholder={selectedProvider.apiKeyPlaceholder}
                        />
                        <button 
                          type="button"
                          onClick={() => setIsShowKey(!isShowKey)}
                          className="absolute right-4 top-4 opacity-30 hover:opacity-100 transition-opacity"
                        >
                          {isShowKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Base URL - OpenAI Compatible */}
                  {selectedProvider?.id === 'openai-compatible' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.2em] flex items-center gap-2">
                          <Globe className="w-4 h-4 text-primary opacity-60" />
                          Base URL
                        </label>
                      </div>
                      <Input
                        type="text"
                        value={localSettings.baseUrl || ''}
                        onChange={(e) => setLocalSettings({...localSettings, baseUrl: e.target.value})}
                        className="bg-black/40 border-white/5 h-12 text-xs font-mono rounded-2xl focus:border-primary/40 transition-all placeholder:opacity-20"
                        placeholder="http://localhost:11434/v1"
                      />
                    </div>
                  )}

                  {/* Model Selection */}
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.2em]">Intelligent Model</label>
                      <div className="flex items-center gap-2.5 bg-white/[0.03] px-3 py-1.5 rounded-full border border-white/5">
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-tight">Free tier only</span>
                        <Switch 
                          checked={isFreeOnly} 
                          onCheckedChange={setIsFreeOnly} 
                        />
                      </div>
                    </div>

                    <Combobox 
                      options={filteredModels.map(m => ({
                        id: m.id,
                        label: m.label,
                        description: m.description,
                        isFree: m.isFree
                      }))}
                      value={localSettings.modelId || ''}
                      onSelect={(id) => setLocalSettings({...localSettings, modelId: id})}
                      placeholder="Choose intelligence layer..."
                      emptyText="No matching models in this tier."
                    />

                    {/* Model Details Card */}
                    {selectedModel && (
                      <div className="p-6 bg-[#1a1a1a]/50 border border-white/5 rounded-[2rem] shadow-2xl animate-in zoom-in-95 duration-500">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 shadow-inner">
                            <Cpu className="w-6 h-6 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold truncate text-foreground/90">{selectedModel.label}</h3>
                            <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed opacity-70">
                              {selectedModel.description}
                            </p>
                          </div>
                        </div>
                        
                        <div className="mt-6 grid grid-cols-3 gap-8 border-t border-white/5 pt-6">
                          <div className="space-y-1.5">
                            <p className="text-[9px] font-black text-muted-foreground uppercase opacity-30 tracking-widest">Context Capacity</p>
                            <p className="text-[13px] font-bold text-foreground/80">{selectedModel.contextLimit ? (selectedModel.contextLimit >= 1000000 ? `${(selectedModel.contextLimit/1000000).toFixed(1)}M` : `${(selectedModel.contextLimit/1000).toFixed(0)}k`) : 'N/A'}</p>
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-[9px] font-black text-muted-foreground uppercase opacity-30 tracking-widest">Pricing Tier</p>
                            <p className={cn(
                              "text-[13px] font-black uppercase tracking-tighter",
                              selectedModel.isFree ? "text-primary" : "text-orange-500"
                            )}>
                              {selectedModel.isFree ? 'Zero Cost' : 'Enterprise'}
                            </p>
                          </div>
                          <div className="space-y-1.5 flex-1">
                            <p className="text-[9px] font-black text-muted-foreground uppercase opacity-30 tracking-widest">Processing Speed</p>
                            <div className="h-1.5 w-full bg-white/5 rounded-full mt-3 overflow-hidden shadow-inner">
                              <div className={cn(
                                "h-full rounded-full transition-all duration-1000",
                                selectedModel.isFree ? "bg-primary/40 w-1/2" : "bg-primary w-5/6 shadow-[0_0_10px_rgba(var(--primary),0.3)]"
                              )} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Advanced Parameters */}
                  <div className="pt-6 border-t border-white/5">
                    <button 
                      type="button"
                      onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                      className="text-[9px] font-black text-foreground/30 hover:text-primary transition-all uppercase tracking-[0.3em] hover:tracking-[0.4em] flex items-center gap-2 group"
                    >
                      {isAdvancedOpen ? '− Collapse Advanced' : '+ Expand Parameters'}
                      <div className="h-[1px] flex-1 bg-white/5 group-hover:bg-primary/20 transition-all" />
                    </button>

                    {isAdvancedOpen && (
                      <div className="mt-10 grid grid-cols-2 gap-10 animate-in slide-in-from-top-6 duration-700">
                        <div className="space-y-4">
                          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground/60">
                            <span>Creative Temperature</span>
                            <span className="text-primary font-mono">{localSettings.temperature}</span>
                          </div>
                          <Input 
                            type="number" step="0.1" min="0" max="2"
                            value={localSettings.temperature}
                            onChange={(e) => setLocalSettings({...localSettings, temperature: Number.parseFloat(e.target.value)})}
                            className="bg-black/60 border-white/5 h-12 rounded-2xl focus:ring-1 ring-primary/20 transition-all"
                          />
                          <p className="text-[9px] text-muted-foreground/40 leading-relaxed">Lower values are focused and deterministic, higher values are more creative.</p>
                        </div>
                        <div className="space-y-4">
                          <label className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground/60">Response Token Ceiling</label>
                          <Input 
                            type="number" step="1024"
                            value={localSettings.maxTokens}
                            onChange={(e) => setLocalSettings({...localSettings, maxTokens: Number.parseInt(e.target.value)})}
                            className="bg-black/60 border-white/5 h-12 rounded-2xl focus:ring-1 ring-primary/20 transition-all"
                          />
                          <p className="text-[9px] text-muted-foreground/40 leading-relaxed">Maximum amount of tokens the model will generate in a single response.</p>
                        </div>

                        <div className="space-y-4">
                          <label className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground/60">Response Token Ceiling</label>
                          <Input 
                            type="number" step="1024"
                            value={localSettings.maxTokens}
                            onChange={(e) => setLocalSettings({...localSettings, maxTokens: Number.parseInt(e.target.value)})}
                            className="bg-black/60 border-white/5 h-12 rounded-2xl focus:ring-1 ring-primary/20 transition-all"
                          />
                          <p className="text-[9px] text-muted-foreground/40 leading-relaxed">Maximum amount of tokens the model will generate in a single response.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'general' && (
                <div className="space-y-10">
                  <header>
                    <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                      <Settings className="w-6 h-6 text-primary" />
                      General Settings
                    </h2>
                    <p className="text-[11px] font-medium text-muted-foreground mt-1.5 opacity-50 uppercase tracking-widest">Customize your agent experience</p>
                  </header>

                  <div className="flex items-center justify-between p-4 bg-white/[0.03] rounded-2xl border border-white/5">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/80">Auto-Approve Changes</label>
                      <p className="text-[9px] text-muted-foreground/50">Automatically execute tool calls (edits, commands) without manual confirmation.</p>
                    </div>
                    <Switch 
                      checked={localSettings.autoApprove ?? true} 
                      onCheckedChange={(checked) => setLocalSettings({...localSettings, autoApprove: checked})} 
                    />
                  </div>
                </div>
              )}

              {activeTab !== 'api' && activeTab !== 'general' && (
                <div className="flex flex-col items-center justify-center py-32 opacity-20 select-none animate-in fade-in duration-700">
                  {activeTab === 'features' && <Sparkles className="w-20 h-20 mb-6 text-primary" />}
                  {activeTab === 'browser' && <Globe className="w-20 h-20 mb-6 text-primary" />}
                  {activeTab === 'terminal' && <Terminal className="w-20 h-20 mb-6 text-primary" />}
                  {activeTab === 'about' && <Info className="w-20 h-20 mb-6 text-primary" />}
                  <h3 className="text-3xl font-black tracking-tighter uppercase">Module Locked</h3>
                  <p className="text-xs font-mono opacity-60 mt-2">Available in upcoming release v1.1.0</p>
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
