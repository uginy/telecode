/**
 * ui-state.ts
 * Centralised DOM refs + derived state helpers.
 * No business logic here — only getters/setters for the view.
 */

export const el = {
  status:       () => document.getElementById('status')!,
  phase:        () => document.getElementById('phase')!,
  output:       () => document.getElementById('output')!,
  prompt:       () => document.getElementById('prompt')! as HTMLTextAreaElement,
  startBtn:     () => document.getElementById('startBtn')! as HTMLButtonElement,
  stopBtn:      () => document.getElementById('stopBtn')! as HTMLButtonElement,
  runBtn:       () => document.getElementById('runBtn')! as HTMLButtonElement,
  tabLogs:      () => document.getElementById('tabLogs')!,
  tabSettings:  () => document.getElementById('tabSettings')!,
  logsPane:     () => document.getElementById('logsPane')!,
  settingsPane:    () => document.getElementById('settingsPane')!,
  settingsNote:    () => document.getElementById('settingsNote')!,
  saveSettingsBtn: () => document.getElementById('saveSettingsBtn')!,
  fetchModelsBtn:  () => document.getElementById('fetchModelsBtn')! as HTMLButtonElement,
  modelPicker:     () => document.getElementById('modelPicker')!,
  settingsNav:     () => document.getElementById('settingsNav')!,
  settingsCats:    () => document.querySelectorAll('.settings-cat'),
  settingsNavItems: () => document.querySelectorAll('.settings-nav-item'),
  viewGroupedBtn:     () => document.getElementById('viewGroupedBtn')! as HTMLButtonElement,
  viewListBtn:     () => document.getElementById('viewListBtn')! as HTMLButtonElement,
  logViewToggles:  () => document.getElementById('logViewToggles')!,
};

export function setStatus(text: string): void {
  const s = el.status();
  s.title = text; // Show as tooltip
  const lower = text.toLowerCase();
  s.dataset.state =
    lower.includes('error') ? 'error' :
    lower.includes('idle')  ? 'idle'  :
    'running';
}

export function setPhaseText(text: string): void {
  el.phase().textContent = text;
}

export function setControlState(statusText: string): void {
  const lower = statusText.toLowerCase();
  const running = lower.includes('running') || lower.includes('thinking') || lower.includes('tool ');
  const ready = lower.includes('ready');
  const connecting = lower.includes('connecting');
  const idle = lower.includes('idle');
  const stopped = lower.includes('stopped');
  const error = lower.includes('error');
  const active = running || ready || connecting || idle;

  el.startBtn().disabled = active && !stopped && !error;
  el.startBtn().textContent = ready ? 'Ready' : active ? 'Started' : 'Start';
  el.stopBtn().disabled = !active || stopped;
  el.runBtn().disabled = running;
}

export type Tab = 'logs' | 'settings';

export function setTab(tab: Tab): void {
  const isLogs = tab === 'logs';
  el.tabLogs().classList.toggle('active', isLogs);
  el.tabSettings().classList.toggle('active', !isLogs);
  el.logsPane().classList.toggle('hidden', !isLogs);
  el.settingsPane().classList.toggle('hidden', isLogs);
  
  // Only show Save button and note on Settings tab
  el.saveSettingsBtn().classList.toggle('hidden', isLogs);
  el.settingsNote().classList.toggle('hidden', isLogs);
  
  // Hide view toggles when not in logs tab
  el.logViewToggles().classList.toggle('hidden', !isLogs);
}
