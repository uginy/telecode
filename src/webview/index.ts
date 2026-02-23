/**
 * index.ts — webview entry point.
 * Wires up event listeners and restores persisted state.
 */

import api from './vscode-api';
import { cmd } from './commands';
import { el, setStatus, setControlState, setTab } from './ui-state';
import { replaceOutput, collapseAllGroups, expandAllGroups } from './log';
import { readForm } from './settings';
import { handleMessage } from './messages';
import { makeIcon } from './icon-service';
import { applyTooltipTranslations, initTooltips } from './tooltip-service';

type PersistedState = {
  output?: string;
  prompt?: string;
  status?: string;
  tab?: 'logs' | 'settings';
  view?: 'grouped';
  filterKinds?: string[];
  filterQuery?: string;
  pinFilters?: boolean;
};

function deriveAllowOutOfWorkspaceByProfile(profile: string): boolean {
  return profile === 'power';
}

function syncSafeModeControls(profile: string): void {
  const effective = profile || 'balanced';
  const inline = document.getElementById('safeModeProfileInline') as HTMLSelectElement | null;
  if (inline) inline.value = effective;
  const allowOut = document.getElementById('allowOutOfWorkspace') as HTMLInputElement | null;
  if (allowOut) {
    allowOut.checked = deriveAllowOutOfWorkspaceByProfile(effective);
    allowOut.disabled = effective !== 'power';
  }
  const settingsSelect = document.getElementById('safeModeProfile') as HTMLSelectElement | null;
  if (settingsSelect) settingsSelect.value = effective;
}

function updateComposerMeta(): void {
  const provider = (document.getElementById('provider') as HTMLInputElement | null)?.value?.trim() || '-';
  const model = (document.getElementById('model') as HTMLInputElement | null)?.value?.trim() || '-';
  const style = (document.getElementById('responseStyle') as HTMLSelectElement | null)?.value?.trim() || '-';

  const metaProvider = document.getElementById('metaProvider');
  const metaModel = document.getElementById('metaModel');
  const metaStyle = document.getElementById('metaStyle');
  if (metaProvider) metaProvider.textContent = `provider: ${provider}`;
  if (metaModel) metaModel.textContent = `model: ${model}`;
  if (metaStyle) metaStyle.textContent = `style: ${style}`;
}

function initStaticIcons(): void {
  const sendBtn = el.runBtn();
  sendBtn.innerHTML = '';
  sendBtn.appendChild(makeIcon('send', 'send-icon'));

  const aboutIcons = Array.from(document.querySelectorAll('[data-about-icon]')) as HTMLElement[];
  const allowed = new Set(['github', 'globe', 'run', 'task', 'channel', 'tool']);
  for (const holder of aboutIcons) {
    const id = holder.dataset.aboutIcon;
    holder.innerHTML = '';
    if (id && allowed.has(id)) {
      holder.appendChild(makeIcon(id as 'github' | 'globe' | 'run' | 'task' | 'channel' | 'tool', 'about-link-icon'));
    }
  }

  updateGroupsToggleButton(true);
}

function updateGroupsToggleButton(collapseAction: boolean): void {
  const btn = document.getElementById('toggleAllGroupsBtn') as HTMLButtonElement | null;
  if (!btn) return;
  btn.dataset.action = collapseAction ? 'collapse' : 'expand';
  const key = collapseAction ? 'btn_collapse_all' : 'btn_expand_all';
  const t = (window as unknown as { __tcTranslations?: Record<string, string> }).__tcTranslations || {};
  const text = t[key] || (collapseAction ? 'Collapse all' : 'Expand all');
  btn.dataset.tooltipKey = key;
  btn.dataset.tooltip = text;
  btn.setAttribute('aria-label', text);
  btn.innerHTML = '';
  btn.appendChild(makeIcon(collapseAction ? 'collapse-all' : 'expand-all', 'log-action-icon'));
}

function bindSafeModeStrip(): void {
  const inline = document.getElementById('safeModeProfileInline') as HTMLSelectElement | null;
  inline?.addEventListener('change', () => {
    const profile = inline.value || 'balanced';
    const settings = readForm();
    settings.safeModeProfile = profile;
    settings.allowOutOfWorkspace = deriveAllowOutOfWorkspaceByProfile(profile);
    cmd.saveSettings(settings);
    syncSafeModeControls(profile);
  });
}

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
    filterKinds: pinFilters ? Array.from(enabledKinds) : [],
    filterQuery: pinFilters ? filterQuery : '',
    pinFilters,
  });
}

// Wire up view toggles
el.viewGroupedBtn().addEventListener('click', () => {
  el.viewGroupedBtn().classList.add('active');
  el.output().setAttribute('data-view', 'grouped');
  saveState();
});

type LogKind =
  | 'tool-start'
  | 'tool-done'
  | 'tool-error'
  | 'status'
  | 'channel'
  | 'llm';

const enabledKinds = new Set<LogKind>();
let filterQuery = '';
let pinFilters = true;

function updatePinFiltersButton(): void {
  const btn = document.getElementById('pinFiltersBtn') as HTMLButtonElement | null;
  if (!btn) return;
  btn.classList.toggle('active', pinFilters);
}

function updateRunSummaryCard(data: { tools: number; errors: number; elapsedMs: number; prompt: string }): void {
  const card = document.getElementById('runSummaryCard');
  if (!card) return;
  const sec = (data.elapsedMs / 1000).toFixed(1);
  card.textContent = `"${data.prompt}" • tools ${data.tools} • errors ${data.errors} • ${sec}s`;
}

function applyGroupedFilters(): void {
  const output = el.output();
  const query = filterQuery.trim().toLowerCase();
  const hasKindFilters = enabledKinds.size > 0;
  const hasQuery = query.length > 0;

  const lines = Array.from(output.querySelectorAll('.grouped-body .log-line')) as HTMLElement[];
  for (const line of lines) {
    const kind = (line.dataset.kind || 'text') as LogKind | string;
    const text = (line.textContent || '').toLowerCase();
    const kindMatch = !hasKindFilters || enabledKinds.has(kind as LogKind);
    const queryMatch = !hasQuery || text.includes(query);
    line.style.display = kindMatch && queryMatch ? '' : 'none';
  }

  const nodes = Array.from(output.querySelectorAll('.grouped-node')) as HTMLElement[];
  for (const node of nodes) {
    const nodeLines = Array.from(node.querySelectorAll('.grouped-body .log-line')) as HTMLElement[];
    const visibleLines = nodeLines.filter((line) => line.style.display !== 'none');
    const shouldHide = (hasKindFilters || hasQuery) && nodeLines.length > 0 && visibleLines.length === 0;
    node.style.display = shouldHide ? 'none' : '';
  }
}

function updateFilterButtons(): void {
  const buttons = Array.from(document.querySelectorAll('.log-filter-btn')) as HTMLButtonElement[];
  for (const button of buttons) {
    if (!button.dataset.kind) {
      continue;
    }
    const kind = (button.dataset.kind || 'all') as LogKind | 'all';
    if (kind === 'all') {
      button.classList.toggle('active', enabledKinds.size === 0);
      continue;
    }
    button.classList.toggle('active', enabledKinds.has(kind));
  }
}

function bindLogFilters(): void {
  const buttons = Array.from(document.querySelectorAll('.log-filter-btn')) as HTMLButtonElement[];
  const input = document.getElementById('logFilterQuery') as HTMLInputElement | null;
  const clear = document.getElementById('logFilterClear') as HTMLButtonElement | null;
  const toggleAll = document.getElementById('toggleAllGroupsBtn') as HTMLButtonElement | null;
  const pinBtn = document.getElementById('pinFiltersBtn') as HTMLButtonElement | null;

  for (const button of buttons) {
    if (!button.dataset.kind) {
      continue;
    }
    button.addEventListener('click', () => {
      const kind = (button.dataset.kind || 'all') as LogKind | 'all';
      if (kind === 'all') {
        enabledKinds.clear();
      } else if (enabledKinds.has(kind)) {
        enabledKinds.delete(kind);
      } else {
        enabledKinds.add(kind);
      }
      updateFilterButtons();
      applyGroupedFilters();
      saveState();
    });
  }

  input?.addEventListener('input', () => {
    filterQuery = input.value;
    applyGroupedFilters();
    saveState();
  });

  clear?.addEventListener('click', () => {
    enabledKinds.clear();
    filterQuery = '';
    if (input) input.value = '';
    updateFilterButtons();
    applyGroupedFilters();
    saveState();
  });

  toggleAll?.addEventListener('click', () => {
    const action = toggleAll.dataset.action || 'collapse';
    if (action === 'collapse') {
      collapseAllGroups();
      updateGroupsToggleButton(false);
    } else {
      expandAllGroups();
      updateGroupsToggleButton(true);
    }
    saveState();
  });

  pinBtn?.addEventListener('click', () => {
    pinFilters = !pinFilters;
    updatePinFiltersButton();
    if (!pinFilters) {
      enabledKinds.clear();
      filterQuery = '';
      if (input) input.value = '';
      updateFilterButtons();
      applyGroupedFilters();
    }
    saveState();
  });

  const presets = Array.from(document.querySelectorAll('.preset-btn')) as HTMLButtonElement[];
  for (const btn of presets) {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset || 'bugfix';
      const prompt = el.prompt();
      if (preset === 'bugfix') {
        prompt.value = 'Find and fix the bug in the current feature. Keep changes minimal and safe, then verify.';
      } else if (preset === 'refactor') {
        prompt.value = 'Refactor the selected module for clarity and maintainability without changing behavior.';
      } else {
        prompt.value = 'Add or improve tests for the changed behavior and cover key edge cases.';
      }
      prompt.focus();
      saveState();
    });
  }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
el.tabLogs().addEventListener('click',     () => { setTab('logs');     api.setState({ ...(api.getState() as object), tab: 'logs' }); });
el.tabSettings().addEventListener('click', () => { setTab('settings'); api.setState({ ...(api.getState() as object), tab: 'settings' }); });

// ── Agent controls ────────────────────────────────────────────────────────────
el.agentToggleBtn().addEventListener('click', () => {
  const action = el.agentToggleBtn().dataset.action;
  if (action === 'stop') {
    cmd.stopAgent();
    return;
  }
  cmd.startAgent();
});

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
  const settings = readForm();
  settings.allowOutOfWorkspace = deriveAllowOutOfWorkspaceByProfile(settings.safeModeProfile || 'balanced');
  cmd.saveSettings(settings);
  updateComposerMeta();
});

const safeModeSelect = document.getElementById('safeModeProfile') as HTMLSelectElement | null;
safeModeSelect?.addEventListener('change', () => {
  syncSafeModeControls(safeModeSelect.value || 'balanced');
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
  updateComposerMeta();
});

window.addEventListener('build-info', (e: Event) => {
  const raw = String((e as CustomEvent).detail || '');
  const match = raw.match(/version=([^;]+)/i);
  const version = (match?.[1] || '').trim();
  const versionEl = document.getElementById('aboutVersion');
  if (versionEl && version) {
    versionEl.textContent = version;
  }
});

window.addEventListener('run-summary', (e: Event) => {
  updateRunSummaryCard((e as CustomEvent).detail as { tools: number; errors: number; elapsedMs: number; prompt: string });
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
  (window as unknown as { __tcTranslations?: Record<string, string> }).__tcTranslations = t;
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

  const toggle = el.agentToggleBtn();
  toggle.dataset.startTitle = t.btn_start || 'Start';
  toggle.dataset.stopTitle = t.btn_stop || 'Stop';
  setControlState(el.status().textContent ?? '');
  applyTooltipTranslations(t);

  const toggleAll = document.getElementById('toggleAllGroupsBtn') as HTMLButtonElement | null;
  updateGroupsToggleButton((toggleAll?.dataset.action || 'collapse') === 'collapse');
}

// ── Incoming messages from extension ─────────────────────────────────────────
window.addEventListener('message', (e: MessageEvent) => {
  handleMessage(e.data);
  const anyExpanded = Array.from(document.querySelectorAll('.grouped-node')).some((node) =>
    (node as HTMLElement).classList.contains('expanded')
  );
  updateGroupsToggleButton(anyExpanded);
  const safeMode = (document.getElementById('safeModeProfile') as HTMLSelectElement | null)?.value || 'balanced';
  syncSafeModeControls(safeMode);
  updateComposerMeta();
  applyGroupedFilters();
  saveState();
});

// ── Restore state after soft webview refresh ──────────────────────────────────
const saved = api.getState() as PersistedState | null;
if (saved) {
  if (saved.output) replaceOutput(saved.output);
  if (saved.prompt) el.prompt().value = saved.prompt;
  if (saved.status) { setStatus(saved.status); setControlState(saved.status); }
  if (saved.tab === 'settings') setTab('settings');
  el.viewGroupedBtn().classList.add('active');
  el.output().setAttribute('data-view', 'grouped');
  pinFilters = saved.pinFilters !== false;
  if (pinFilters && saved.filterQuery) {
    filterQuery = saved.filterQuery;
    const input = document.getElementById('logFilterQuery') as HTMLInputElement | null;
    if (input) input.value = filterQuery;
  }
  if (pinFilters && Array.isArray(saved.filterKinds)) {
    enabledKinds.clear();
    for (const k of saved.filterKinds) {
      enabledKinds.add(k as LogKind);
    }
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
bindLogFilters();
updateFilterButtons();
updatePinFiltersButton();
applyGroupedFilters();
initStaticIcons();
initTooltips();
bindSafeModeStrip();
updateComposerMeta();
setControlState(el.status().textContent ?? '');
cmd.requestSettings();
