/**
 * index.ts — webview entry point.
 * Wires up event listeners and restores persisted state.
 */

import api from './vscode-api';
import { cmd } from './commands';
import { el, setStatus, setControlState, setTab } from './ui-state';
import { replaceOutput } from './log';
import { readForm } from './settings';
import { handleMessage } from './messages';

type PersistedState = {
  output?: string;
  prompt?: string;
  status?: string;
  tab?: 'logs' | 'settings';
};

function saveState(): void {
  api.setState({
    output: el.output().textContent,
    prompt: el.prompt().value,
    status: el.status().textContent,
  });
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
el.tabLogs().addEventListener('click',     () => { setTab('logs');     api.setState({ ...(api.getState() as object), tab: 'logs' }); });
el.tabSettings().addEventListener('click', () => { setTab('settings'); api.setState({ ...(api.getState() as object), tab: 'settings' }); });

// ── Agent controls ────────────────────────────────────────────────────────────
el.startBtn().addEventListener('click', () => cmd.startAgent());
el.stopBtn().addEventListener('click',  () => cmd.stopAgent());

// ── Task prompt ───────────────────────────────────────────────────────────────
function runTask(): void {
  const prompt = el.prompt().value.trim();
  if (!prompt) return;
  cmd.runTask(prompt);
}

el.runBtn().addEventListener('click', runTask);
el.prompt().addEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runTask();
});

// ── Settings form ─────────────────────────────────────────────────────────────
el.saveSettingsBtn().addEventListener('click', () => {
  cmd.saveSettings(readForm());
});

el.fetchModelsBtn().addEventListener('click', () => {
  const settings = readForm();
  cmd.fetchModels(settings.provider, settings.baseUrl, settings.apiKey);
  el.settingsNote().textContent = 'Fetching models...';
});

window.addEventListener('models-loaded', (e: Event) => {
  const models = (e as CustomEvent).detail as string[];
  updateModelSuggestions(models);
  el.settingsNote().textContent = `Loaded ${models.length} models`;
});

function updateModelSuggestions(models: string[]): void {
  const picker = el.modelPicker();
  picker.innerHTML = '';
  if (models.length === 0) {
    picker.classList.add('hidden');
    return;
  }

  for (const m of models) {
    const div = document.createElement('div');
    div.className = 'picker-item';
    div.textContent = m;
    div.addEventListener('click', () => {
      (document.getElementById('model') as HTMLInputElement).value = m;
      picker.classList.add('hidden');
    });
    picker.appendChild(div);
  }
  picker.classList.remove('hidden');
}

// Show picker on focus if it has items
const modelInput = document.getElementById('model') as HTMLInputElement;
modelInput?.addEventListener('focus', () => {
  const picker = el.modelPicker();
  if (picker.children.length > 0) {
    picker.classList.remove('hidden');
  }
});

document.getElementById('modelChevron')?.addEventListener('click', (e) => {
  e.stopPropagation();
  modelInput.focus();
  const picker = el.modelPicker();
  if (picker.children.length > 0) {
    picker.classList.toggle('hidden');
  }
});

// Close picker when clicking outside
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const isModelInput = target.id === 'model';
  const isPicker = target.closest('.picker');
  const isFetchBtn = target.id === 'fetchModelsBtn';
  
  if (!isModelInput && !isPicker && !isFetchBtn) {
    el.modelPicker().classList.add('hidden');
  }
});

// ── Incoming messages from extension ─────────────────────────────────────────
window.addEventListener('message', (e: MessageEvent) => {
  handleMessage(e.data);
  saveState();
});

// ── Restore state after soft webview refresh ──────────────────────────────────
const saved = api.getState() as PersistedState | null;
if (saved) {
  if (saved.output) replaceOutput(saved.output);
  if (saved.prompt) el.prompt().value = saved.prompt;
  if (saved.status) { setStatus(saved.status); setControlState(saved.status); }
  if (saved.tab === 'settings') setTab('settings');
}

// ── Boot ──────────────────────────────────────────────────────────────────────
setControlState(el.status().textContent ?? '');
cmd.requestSettings();
