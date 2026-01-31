import type React from 'react';
import type { LucideIcon } from 'lucide-react';

interface SettingsLockedTabProps {
  icon: LucideIcon;
  label: string;
}

export const SettingsLockedTab: React.FC<SettingsLockedTabProps> = ({ icon: Icon, label }) => {
  return (
    <div className="flex flex-col items-center justify-center py-32 opacity-20 select-none animate-in fade-in duration-700">
      <Icon className="w-20 h-20 mb-6 text-primary" />
      <h3 className="text-3xl font-black tracking-tighter uppercase">{label}</h3>
      <p className="text-xs font-mono opacity-60 mt-2">Available in upcoming release v1.1.0</p>
    </div>
  );
};
