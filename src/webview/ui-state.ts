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
};

export function setStatus(text: string): void {
  const s = el.status();
  s.textContent = text;
  const lower = text.toLowerCase();
  s.dataset['state'] =
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
  const ready   = lower.includes('ready');

  el.startBtn().disabled = running || ready;
  el.startBtn().textContent = ready ? 'Ready' : 'Start';
  el.stopBtn().disabled  = !running && !ready;
  el.runBtn().disabled   = running;
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
}
