/**
 * ui-state.ts
 * Centralised DOM refs + derived state helpers.
 * No business logic here — only getters/setters for the view.
 */

import { makeIcon } from './icon-service';

export const el = {
  status:       () => document.getElementById('status')!,
  phase:        () => document.getElementById('phase')!,
  output:       () => document.getElementById('output')!,
  prompt:       () => document.getElementById('prompt')! as HTMLTextAreaElement,
  agentToggleBtn: () => document.getElementById('agentToggleBtn')! as HTMLButtonElement,
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
  const toggle = el.agentToggleBtn();
  const startTitle = toggle.dataset.startTitle || 'Start';
  const stopTitle = toggle.dataset.stopTitle || 'Stop';

  toggle.dataset.action = active && !stopped && !error ? 'stop' : 'start';
  toggle.innerHTML = '';
  toggle.appendChild(makeIcon(toggle.dataset.action === 'stop' ? 'stop' : 'run', 'top-icon-glyph'));
  toggle.classList.toggle('toggle-stop', toggle.dataset.action === 'stop');
  toggle.classList.toggle('toggle-play', toggle.dataset.action !== 'stop');
  const title = toggle.dataset.action === 'stop' ? stopTitle : startTitle;
  toggle.dataset.tooltip = title;
  toggle.dataset.tooltipKey = toggle.dataset.action === 'stop' ? 'tt_toggle_agent_stop' : 'tt_toggle_agent_start';
  toggle.setAttribute('aria-label', title);

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
