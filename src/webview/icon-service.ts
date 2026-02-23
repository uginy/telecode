type IconId =
  | 'tool-start'
  | 'tool-done'
  | 'tool-error'
  | 'phase'
  | 'status'
  | 'llm'
  | 'text'
  | 'request'
  | 'user'
  | 'run'
  | 'send'
  | 'stop'
  | 'agent'
  | 'channel'
  | 'task'
  | 'session'
  | 'tool'
  | 'github'
  | 'globe';

const ICON_PATHS: Record<IconId, string> = {
  'tool-start': '<path d="M4 8h8M8 4v8"/><circle cx="16" cy="16" r="3"/><path d="M19 19l3 3"/>',
  'tool-done': '<path d="M4 12l5 5L20 6"/>',
  'tool-error': '<path d="M6 6l12 12M18 6L6 18"/>',
  phase: '<path d="M12 3l7 4v10l-7 4-7-4V7z"/><path d="M12 7v10"/>',
  status: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  llm: '<path d="M7 6h10l2 3-2 3H7L5 9z"/><path d="M8 14h8l2 3-2 3H8l-2-3z"/>',
  text: '<circle cx="12" cy="12" r="2"/>',
  request: '<path d="M5 6h14v12H5z"/><path d="M8 10h8M8 14h5"/>',
  user: '<circle cx="12" cy="8" r="3"/><path d="M6 19c1.5-3 4-4 6-4s4.5 1 6 4"/>',
  run: '<path d="M7 5l11 7-11 7z"/>',
  send: '<path d="M4 19l16-7L4 5v5l10 2-10 2z"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5"/>',
  agent: '<rect x="6" y="6" width="12" height="12" rx="2"/><circle cx="10" cy="12" r="1"/><circle cx="14" cy="12" r="1"/><path d="M10 16h4"/>',
  channel: '<path d="M4 19l16-7L4 5v5l10 2-10 2z"/>',
  task: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6M9 13h6M9 17h4"/>',
  session: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 3v4M16 3v4M8 12h8"/>',
  tool: '<path d="M14 3a5 5 0 0 0 0 10l5 5 2-2-5-5a5 5 0 0 0-2-8z"/><path d="M4 20l6-6"/>',
  github: '<path d="M9 19c-4.5 1.4-4.5-2.1-6.3-2.8"/><path d="M15 22v-3.3a3.3 3.3 0 0 0-.9-2.6c3-.3 6.1-1.5 6.1-6.6a5.2 5.2 0 0 0-1.4-3.6 4.9 4.9 0 0 0-.1-3.6s-1.1-.3-3.7 1.4a12.8 12.8 0 0 0-6.7 0C5.7 2 4.6 2.3 4.6 2.3a4.9 4.9 0 0 0-.1 3.6 5.2 5.2 0 0 0-1.4 3.6c0 5 3.1 6.2 6.1 6.6a3.3 3.3 0 0 0-.9 2.6V22"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 2.5 12.4 0 18"/><path d="M12 3c-2.5 2.6-2.5 12.4 0 18"/>',
};

function createSvgIcon(path: string): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = path;
  return svg;
}

export function makeIcon(id: IconId, className: string): HTMLElement {
  const span = document.createElement('span');
  span.className = className;
  span.appendChild(createSvgIcon(ICON_PATHS[id]));
  return span;
}
