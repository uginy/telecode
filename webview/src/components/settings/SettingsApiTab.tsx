import type React from 'react';
import { useState } from 'react';
import { SlidersHorizontal, Eye, EyeOff, ExternalLink, Cpu, Globe } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Combobox } from '@/components/ui/combobox';
import { PROVIDERS, getProviderById } from '@/config/providers';
import type { Settings } from '@/store/useChatStore';

interface SettingsApiTabProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
}

export const SettingsApiTab: React.FC<SettingsApiTabProps> = ({ settings, onChange }) => {
  const [isShowKey, setIsShowKey] = useState(false);
  const [isFreeOnly, setIsFreeOnly] = useState(false);

  const selectedProvider = getProviderById(settings.provider);
  const providerModels = selectedProvider?.models || [];
  const filteredModels = isFreeOnly ? providerModels.filter(m => m.isFree) : providerModels;
  const selectedModel = providerModels.find(m => m.id === settings.modelId);

  return (
    <div className="space-y-10">
      <header>
        <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
          <SlidersHorizontal className="w-6 h-6 text-primary" />
          API Configuration
        </h2>
        <p className="text-[11px] font-medium text-muted-foreground mt-1.5 opacity-50 uppercase tracking-widest">Connect your favorite AI minds</p>
      </header>

      <div className="space-y-4">
        <label className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.2em]">Primary AI Provider</label>
        <Combobox
          options={PROVIDERS.map(p => ({
            id: p.id,
            label: p.label,
            description: p.description
          }))}
          value={settings.provider || ''}
          onSelect={(id) => {
            const newProvider = getProviderById(id);
            onChange({
              ...settings,
              provider: id,
              modelId: newProvider?.models[0]?.id || ''
            });
          }}
          placeholder="Search providers..."
        />
      </div>

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
              value={settings.apiKey || ''}
              onChange={(e) => onChange({ ...settings, apiKey: e.target.value })}
              className="bg-card/80 border-border h-12 text-xs font-mono pr-12 rounded-2xl focus:border-primary/40 transition-all placeholder:opacity-30"
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
            value={settings.baseUrl || ''}
            onChange={(e) => onChange({ ...settings, baseUrl: e.target.value })}
            className="bg-card/80 border-border h-12 text-xs font-mono rounded-2xl focus:border-primary/40 transition-all placeholder:opacity-30"
            placeholder="http://localhost:11434/v1"
          />
        </div>
      )}

      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.2em]">Intelligent Model</label>
          <div className="flex items-center gap-2.5 bg-white/5 px-3 py-1.5 rounded-full border border-border/50">
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
          value={settings.modelId || ''}
          onSelect={(id) => onChange({ ...settings, modelId: id })}
          placeholder="Choose intelligence layer..."
          emptyText="No matching models in this tier."
        />

        {selectedModel && (
          <div className="p-6 bg-card/50 border border-border rounded-[2rem] shadow-2xl animate-in zoom-in-95 duration-500">
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
          </div>
        )}
      </div>
    </div>
  );
};
