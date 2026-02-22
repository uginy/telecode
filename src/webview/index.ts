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
  view?: 'grouped' | 'list';
};

function saveState(): void {
  const outputEl = el.output();
  const lines = Array.from(outputEl.querySelectorAll('.log-line'));
  const outputText = lines.map((l) => l.textContent).join('\n');
  const viewState = el.output().getAttribute('data-view') || 'grouped';

  api.setState({ 
    output: outputText,
    prompt: el.prompt().value,
    status: el.status().textContent,
    view: viewState,
    tab: el.tabLogs().classList.contains('active') ? 'logs' : 'settings',
  });
}

// Wire up view toggles
el.viewGroupedBtn().addEventListener('click', () => {
  el.viewGroupedBtn().classList.add('active');
  el.viewListBtn().classList.remove('active');
  el.output().setAttribute('data-view', 'grouped');
  saveState();
});

el.viewListBtn().addEventListener('click', () => {
  el.viewListBtn().classList.add('active');
  el.viewGroupedBtn().classList.remove('active');
  el.output().setAttribute('data-view', 'list');
  saveState();
});

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

// ── Settings Sub-tabs ─────────────────────────────────────────────────────────
function updateSettingsCategory(catId: string): void {
  const cats = Array.from(el.settingsCats());
  const navs = Array.from(el.settingsNavItems());

  for (const c of cats) {
    c.classList.toggle('hidden', c.id !== `cat${catId.charAt(0).toUpperCase()}${catId.slice(1)}`);
  }
  for (const n of navs) {
    n.classList.toggle('active', (n as HTMLElement).dataset.cat === catId);
  }
}

for (const btn of Array.from(el.settingsNavItems())) {
  btn.addEventListener('click', () => {
    const cat = (btn as HTMLElement).dataset.cat;
    if (cat) updateSettingsCategory(cat);
  });
}

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

// ── i18n ──────────────────────────────────────────────────────────────────────
window.addEventListener('translate', (e: Event) => {
  const translations = (e as CustomEvent).detail as Record<string, string>;
  applyTranslations(translations);
});

function applyTranslations(t: Record<string, string>): void {
  // Translate text content
  const textElements = Array.from(document.querySelectorAll('[data-t]'));
  for (const element of textElements) {
    const key = element.getAttribute('data-t');
    if (key && t[key]) {
      element.textContent = t[key];
    }
  }

  // Translate placeholders
  const placeholderElements = Array.from(document.querySelectorAll('[data-t-placeholder]'));
  for (const element of placeholderElements) {
    const key = element.getAttribute('data-t-placeholder');
    if (key && t[key]) {
      (element as HTMLInputElement | HTMLTextAreaElement).placeholder = t[key];
    }
  }
}

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
  if (saved.view === 'list') {
    el.viewListBtn().classList.add('active');
    el.viewGroupedBtn().classList.remove('active');
    el.output().setAttribute('data-view', 'list');
  } else {
    el.viewGroupedBtn().classList.add('active');
    el.viewListBtn().classList.remove('active');
    el.output().setAttribute('data-view', 'grouped');
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
setControlState(el.status().textContent ?? '');
cmd.requestSettings();
