import type { DiscoveredModel } from '../agent/codingAgent';

export function filterModels(models: DiscoveredModel[], query: string, freeOnly: boolean): DiscoveredModel[] {
  const normalized = query.trim().toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);
  return models
    .filter((model) => (!freeOnly || model.free) && words.every((word) => model.id.toLowerCase().includes(word)))
    .sort((a, b) => Number(b.id.toLowerCase().startsWith(normalized)) - Number(a.id.toLowerCase().startsWith(normalized)))
    .slice(0, 12);
}

export function initModelAutocomplete(input: HTMLInputElement, picker: HTMLElement, freeOnly: HTMLInputElement) {
  let models: DiscoveredModel[] = [];
  let loaded = false;
  let active = -1;
  let searching = false;

  function close(): void {
    picker.classList.add('hidden');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function select(model: string): void {
    input.value = model;
    searching = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  }

  function render(): void {
    close();
    picker.replaceChildren();
    if (!loaded || document.activeElement !== input) return;
    for (const model of filterModels(models, searching ? input.value : '', freeOnly.checked)) {
      const option = document.createElement('div');
      option.id = `model-option-${picker.children.length}`;
      option.className = 'picker-item';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.textContent = model.id;
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', () => select(model.id));
      picker.appendChild(option);
    }
    if (!picker.children.length) {
      const empty = document.createElement('div');
      empty.className = 'picker-empty';
      empty.setAttribute('role', 'status');
      const translations = (window as unknown as { __tcTranslations?: Record<string, string> }).__tcTranslations;
      empty.textContent = translations?.model_no_matches || 'No matches. You can enter a model ID manually.';
      picker.appendChild(empty);
    }
    picker.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
  }

  input.addEventListener('focus', () => {
    searching = false;
    input.select();
    render();
  });
  input.addEventListener('click', () => {
    if (picker.classList.contains('hidden')) render();
  });
  input.addEventListener('input', () => {
    searching = true;
    render();
  });
  freeOnly.addEventListener('change', () => {
    const wasSearching = searching;
    input.focus();
    searching = wasSearching;
    render();
  });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      if (!picker.classList.contains('hidden')) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
      return;
    }
    if (event.key === 'Tab') {
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (picker.classList.contains('hidden')) render();
      const options = Array.from(picker.querySelectorAll<HTMLElement>('[role="option"]'));
      if (!options.length) return;
      event.preventDefault();
      active = active < 0
        ? (event.key === 'ArrowDown' ? 0 : options.length - 1)
        : (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options.forEach((option, index) => option.setAttribute('aria-selected', String(index === active)));
      input.setAttribute('aria-activedescendant', options[active].id);
      options[active].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && active >= 0 && !picker.classList.contains('hidden')) {
      event.preventDefault();
      select(picker.children[active].textContent!);
    }
  });

  return {
    setModels(next: DiscoveredModel[]): void {
      models = next;
      loaded = true;
      render();
    },
    clear(): void {
      models = [];
      loaded = false;
      close();
    },
  };
}
