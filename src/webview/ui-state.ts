/**
 * ui-state.ts
 * Centralised DOM refs + derived state helpers.
 * No business logic here — only getters/setters for the view.
 */

import { makeIcon, type IconId } from './icon-service';

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
  settingsToolbar: () => document.getElementById('settingsToolbar')!,
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
  taskResultCard:  () => document.getElementById('taskResultCard'),
  taskResultBody: () => document.getElementById('taskResultBody'),
  taskResultToggleBtn: () => document.getElementById('taskResultToggleBtn')! as HTMLButtonElement,
  taskResultTitle: () => document.getElementById('taskResultTitle')!,
  taskResultSummary: () => document.getElementById('taskResultSummary')!,
  taskResultMeta: () => document.getElementById('taskResultMeta')!,
  taskResultPrompt: () => document.getElementById('taskResultPrompt')!,
  taskResultFiles: () => document.getElementById('taskResultFiles')!,
  taskResultChecks: () => document.getElementById('taskResultChecks')!,
  taskDiffBtn: () => document.getElementById('taskDiffBtn')! as HTMLButtonElement,
  taskChecksBtn: () => document.getElementById('taskChecksBtn')! as HTMLButtonElement,
  taskRerunBtn: () => document.getElementById('taskRerunBtn')! as HTMLButtonElement,
  taskResumeBtn: () => document.getElementById('taskResumeBtn')! as HTMLButtonElement,
  taskCommitBtn: () => document.getElementById('taskCommitBtn')! as HTMLButtonElement,
  taskRevertBtn: () => document.getElementById('taskRevertBtn')! as HTMLButtonElement,
};

let agentActive = false;
let channelsConnected = false;

function getTranslations(): Record<string, string> {
  return (window as unknown as { __tcTranslations?: Record<string, string> }).__tcTranslations || {};
}

function getTooltipText(key: string, fallback: string): string {
  return getTranslations()[key] || fallback;
}

function setToggleVisual(
  button: HTMLButtonElement,
  state: 'on' | 'off',
  icon: IconId,
  tooltipKey: string,
  tooltipFallback: string
): void {
  button.dataset.state = state;
  button.classList.toggle('is-on', state === 'on');
  button.classList.toggle('is-off', state === 'off');
  button.dataset.tooltipKey = tooltipKey;
  const tooltip = getTooltipText(tooltipKey, tooltipFallback);
  button.dataset.tooltip = tooltip;
  button.setAttribute('aria-label', tooltip);
  button.innerHTML = '';
  button.appendChild(makeIcon(icon, 'top-icon-glyph'));
}

function statusMeansAgentActive(statusText: string): boolean {
  const lower = statusText.trim().toLowerCase();
  if (!lower) return false;
  if (lower.includes('idle') || lower.includes('stopped') || lower.includes('error')) return false;
  return true;
}

function applyAgentToggle(): void {
  const button = el.agentToggleBtn();
  if (agentActive || channelsConnected) {
    setToggleVisual(button, 'on', 'stop', 'tt_toggle_agent_stop', 'Stop TeleCode (agent + channels)');
  } else {
    setToggleVisual(button, 'off', 'run', 'tt_toggle_agent_start', 'Start TeleCode (agent + channels)');
  }
}

export function setStatus(text: string): void {
  const s = el.status();
  s.textContent = text;
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
  el.runBtn().disabled = running;
  setAgentToggleState(statusMeansAgentActive(statusText));
}

export function setAgentToggleState(active: boolean): void {
  agentActive = active;
  applyAgentToggle();
}

export function setChannelsToggleState(connected: boolean): void {
  channelsConnected = connected;
  applyAgentToggle();
}

export function isAgentToggleOn(): boolean {
  return agentActive;
}

export function isChannelsToggleOn(): boolean {
  return false;
}

export function refreshToggleLabels(): void {
  applyAgentToggle();
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
  el.settingsToolbar().classList.toggle('hidden', isLogs);
  
  // Hide view toggles when not in logs tab
  el.logViewToggles().classList.toggle('hidden', !isLogs);
}
