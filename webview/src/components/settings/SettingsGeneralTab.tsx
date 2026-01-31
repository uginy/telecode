import type React from 'react';
import { Settings } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { Settings as SettingsState } from '@/store/useChatStore';

interface SettingsGeneralTabProps {
  settings: SettingsState;
  onChange: (settings: SettingsState) => void;
}

export const SettingsGeneralTab: React.FC<SettingsGeneralTabProps> = ({ settings, onChange }) => {
  return (
    <div className="space-y-10">
      <header>
        <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary" />
          General Settings
        </h2>
        <p className="text-[11px] font-medium text-muted-foreground mt-1.5 opacity-50 uppercase tracking-widest">
          Customize your agent experience
        </p>
      </header>

      <div className="flex items-center justify-between p-4 bg-white/[0.03] rounded-2xl border border-white/5">
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/80">Auto-Approve Changes</label>
          <p className="text-[9px] text-muted-foreground/50">Automatically execute tool calls (edits, commands) without manual confirmation.</p>
        </div>
        <Switch
          checked={settings.autoApprove ?? true}
          onCheckedChange={(checked) => onChange({ ...settings, autoApprove: checked })}
        />
      </div>
    </div>
  );
};
