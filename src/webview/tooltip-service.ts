const TOOLTIP_SELECTOR = '[data-tooltip]';
const VIEWPORT_GAP = 8;

let tooltipEl: HTMLDivElement | null = null;
let activeTarget: HTMLElement | null = null;

function ensureTooltip(): HTMLDivElement {
  if (tooltipEl) return tooltipEl;
  const el = document.createElement('div');
  el.className = 'tc-tooltip';
  el.setAttribute('role', 'tooltip');
  document.body.appendChild(el);
  tooltipEl = el;
  return el;
}

function placements(preferred: string): Array<'top' | 'right' | 'bottom' | 'left'> {
  const p = preferred === 'right' || preferred === 'bottom' || preferred === 'left' ? preferred : 'top';
  const order: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left'];
  return [p, ...order.filter((x) => x !== p)];
}

function calcPos(
  trigger: DOMRect,
  tipRect: DOMRect,
  place: 'top' | 'right' | 'bottom' | 'left'
): { top: number; left: number; fits: boolean } {
  let top = 0;
  let left = 0;
  if (place === 'top') {
    top = trigger.top - tipRect.height - VIEWPORT_GAP;
    left = trigger.left + (trigger.width - tipRect.width) / 2;
  } else if (place === 'bottom') {
    top = trigger.bottom + VIEWPORT_GAP;
    left = trigger.left + (trigger.width - tipRect.width) / 2;
  } else if (place === 'right') {
    top = trigger.top + (trigger.height - tipRect.height) / 2;
    left = trigger.right + VIEWPORT_GAP;
  } else {
    top = trigger.top + (trigger.height - tipRect.height) / 2;
    left = trigger.left - tipRect.width - VIEWPORT_GAP;
  }

  const fits =
    top >= 4 &&
    left >= 4 &&
    top + tipRect.height <= window.innerHeight - 4 &&
    left + tipRect.width <= window.innerWidth - 4;

  return { top, left, fits };
}

function showTooltip(target: HTMLElement): void {
  const text = (target.dataset.tooltip || '').trim();
  if (!text) return;
  const tip = ensureTooltip();
  activeTarget = target;
  tip.textContent = text;
  tip.dataset.open = '1';

  const preferred = target.dataset.tooltipPlacement || 'top';
  tip.style.top = '0px';
  tip.style.left = '0px';
  const tipRect = tip.getBoundingClientRect();
  const triggerRect = target.getBoundingClientRect();

  let pos = calcPos(triggerRect, tipRect, 'top');
  for (const place of placements(preferred)) {
    const next = calcPos(triggerRect, tipRect, place);
    if (next.fits) {
      pos = next;
      tip.dataset.place = place;
      break;
    }
  }

  const clampedTop = Math.max(4, Math.min(pos.top, window.innerHeight - tipRect.height - 4));
  const clampedLeft = Math.max(4, Math.min(pos.left, window.innerWidth - tipRect.width - 4));
  tip.style.top = `${clampedTop}px`;
  tip.style.left = `${clampedLeft}px`;
}

function hideTooltip(): void {
  if (!tooltipEl) return;
  tooltipEl.dataset.open = '0';
  activeTarget = null;
}

function bindElement(el: HTMLElement): void {
  if (el.dataset.tooltipBound === '1') return;
  el.dataset.tooltipBound = '1';
  el.addEventListener('mouseenter', () => showTooltip(el));
  el.addEventListener('mouseleave', hideTooltip);
  el.addEventListener('focus', () => showTooltip(el));
  el.addEventListener('blur', hideTooltip);
}

export function initTooltips(): void {
  const all = Array.from(document.querySelectorAll(TOOLTIP_SELECTOR)) as HTMLElement[];
  for (const el of all) bindElement(el);

  window.addEventListener('scroll', () => {
    if (activeTarget) showTooltip(activeTarget);
  }, true);
  window.addEventListener('resize', () => {
    if (activeTarget) showTooltip(activeTarget);
  });
}

export function applyTooltipTranslations(t: Record<string, string>): void {
  const all = Array.from(document.querySelectorAll('[data-tooltip-key]')) as HTMLElement[];
  for (const el of all) {
    const key = el.dataset.tooltipKey || '';
    if (key && t[key]) {
      el.dataset.tooltip = t[key];
    }
  }
}
