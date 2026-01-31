import type React from 'react';
import { Sparkles, Search, Layers, Brain, Terminal, FileText, SlidersHorizontal } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Settings } from '@/store/useChatStore';

interface SettingsFeaturesTabProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
}

const toNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const SettingsFeaturesTab: React.FC<SettingsFeaturesTabProps> = ({ settings, onChange }) => {
  const update = (partial: Partial<Settings>) => {
    onChange({ ...settings, ...partial });
  };

  return (
    <div className="space-y-10">
      <header>
        <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-primary" />
          Features & Context
        </h2>
        <p className="text-[11px] font-medium text-muted-foreground mt-1.5 opacity-50 uppercase tracking-widest">
          Control how AIS builds context
        </p>
      </header>

      <Card className="bg-white/[0.03] border-white/5">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            Intent Routing (Micro-LLM)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/80">Enabled</label>
              <p className="text-[9px] text-muted-foreground/50">Use a micro-model to choose context strategy before each request.</p>
            </div>
            <Switch
              checked={settings.intentRoutingEnabled}
              onCheckedChange={(checked) => update({ intentRoutingEnabled: checked })}
            />
          </div>

          <div className="grid gap-3">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/80">Intent Model ID</label>
              <Input
                value={settings.intentRoutingModel}
                onChange={(e) => update({ intentRoutingModel: e.target.value })}
                className="bg-black/40 border-white/5 h-10 text-xs font-mono rounded-xl"
                placeholder="(optional)"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/80">Max Tokens</label>
                <Input
                  type="number"
                  min={16}
                  max={2048}
                  value={settings.intentRoutingMaxTokens}
                  onChange={(e) => update({ intentRoutingMaxTokens: toNumber(e.target.value, settings.intentRoutingMaxTokens) })}
                  className="bg-black/40 border-white/5 h-10 text-xs font-mono rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/80">Temperature</label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.intentRoutingTemperature}
                  onChange={(e) => update({ intentRoutingTemperature: toNumber(e.target.value, settings.intentRoutingTemperature) })}
                  className="bg-black/40 border-white/5 h-10 text-xs font-mono rounded-xl"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.03] border-white/5">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            Context Sources
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/80">Open Tabs</label>
              <p className="text-[9px] text-muted-foreground/50">Include open editors when user doesn’t specify files.</p>
            </div>
            <Switch
              checked={settings.contextUseOpenTabs}
              onCheckedChange={(checked) => update({ contextUseOpenTabs: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/80">Terminals</label>
              <p className="text-[9px] text-muted-foreground/50">Add recent terminal context and open terminal names.</p>
            </div>
            <Switch
              checked={settings.contextUseTerminals}
              onCheckedChange={(checked) => update({ contextUseTerminals: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/80">Regex Search</label>
              <p className="text-[9px] text-muted-foreground/50">Include regex matches from the workspace.</p>
            </div>
            <Switch
              checked={settings.contextUseSearch}
              onCheckedChange={(checked) => update({ contextUseSearch: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/80">Semantic Search</label>
              <p className="text-[9px] text-muted-foreground/50">Include semantic matches from the index.</p>
            </div>
            <Switch
              checked={settings.contextUseSemantic}
              onCheckedChange={(checked) => update({ contextUseSemantic: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/80">Semantic First</label>
              <p className="text-[9px] text-muted-foreground/50">Prefer semantic context before regex search.</p>
            </div>
            <Switch
              checked={settings.contextSemanticFirst}
              onCheckedChange={(checked) => update({ contextSemanticFirst: checked })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.03] border-white/5">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            Context Limits
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/80 flex items-center gap-2">
              <FileText className="w-3 h-3" />
              Max Open Tabs
            </label>
            <Input
              type="number"
              min={1}
              max={50}
              value={settings.contextMaxOpenTabs}
              onChange={(e) => update({ contextMaxOpenTabs: toNumber(e.target.value, settings.contextMaxOpenTabs) })}
              className="bg-black/40 border-white/5 h-10 text-xs font-mono rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/80 flex items-center gap-2">
              <Search className="w-3 h-3" />
              Max Snippets
            </label>
            <Input
              type="number"
              min={1}
              max={50}
              value={settings.contextMaxSearchSnippets}
              onChange={(e) => update({ contextMaxSearchSnippets: toNumber(e.target.value, settings.contextMaxSearchSnippets) })}
              className="bg-black/40 border-white/5 h-10 text-xs font-mono rounded-xl"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.03] border-white/5">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            Context Tracking
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/80">Track Files</label>
              <p className="text-[9px] text-muted-foreground/50">Detect when files change outside AIS Code.</p>
            </div>
            <Switch
              checked={settings.contextTrackFiles}
              onCheckedChange={(checked) => update({ contextTrackFiles: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/80">Warn on Stale</label>
              <p className="text-[9px] text-muted-foreground/50">Include stale file warnings in context.</p>
            </div>
            <Switch
              checked={settings.contextWarnStale}
              onCheckedChange={(checked) => update({ contextWarnStale: checked })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
