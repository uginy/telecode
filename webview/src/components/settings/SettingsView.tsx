import type React from 'react';
import { useState } from 'react';
import { Settings, Globe, ChevronRight, Sparkles, Terminal, Info, SlidersHorizontal } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/useChatStore';
import { getProviderById } from '@/config/providers';
import { SettingsApiTab } from './SettingsApiTab';
import { SettingsGeneralTab } from './SettingsGeneralTab';
import { SettingsFeaturesTab } from './SettingsFeaturesTab';
import { SettingsLockedTab } from './SettingsLockedTab';

export type SettingsTab = 'api' | 'features' | 'browser' | 'terminal' | 'general' | 'about';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, setView, updateUsage, usage } = useChatStore();
  const [localSettings, setLocalSettings] = useState(settings);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const handleSave = () => {
    const hasChanges = JSON.stringify(settings) !== JSON.stringify(localSettings);

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

  const NavItem: React.FC<{ id: SettingsTab; label: string; icon: React.ElementType }> = ({ id, label, icon: Icon }) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium transition-all whitespace-nowrap',
        activeTab === id
          ? 'bg-accent text-foreground border-l-2 border-primary'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border-l-2 border-transparent'
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {activeTab === id && <ChevronRight className="w-3 h-3 opacity-30" />}
    </button>
  );

  return (
    <div className="flex flex-col h-screen bg-[#111111] text-foreground font-sans">
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

        <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#0a0a0a]">
          <ScrollArea className="h-full">
            <div className="p-8 max-w-2xl mx-auto w-full space-y-12 animate-in fade-in duration-500">
              {activeTab === 'general' && (
                <SettingsGeneralTab settings={localSettings} onChange={setLocalSettings} />
              )}

              {activeTab === 'api' && (
                <SettingsApiTab settings={localSettings} onChange={setLocalSettings} />
              )}

              {activeTab === 'features' && (
                <SettingsFeaturesTab settings={localSettings} onChange={setLocalSettings} />
              )}

              {activeTab === 'browser' && (
                <SettingsLockedTab icon={Globe} label="Module Locked" />
              )}

              {activeTab === 'terminal' && (
                <SettingsLockedTab icon={Terminal} label="Module Locked" />
              )}

              {activeTab === 'about' && (
                <SettingsLockedTab icon={Info} label="Module Locked" />
              )}
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
};
