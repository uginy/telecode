/**
 * log.ts
 * Renders log lines into the output element with semantic colour coding
 * and builds a grouped Thought Grouped.
 */

import { el } from './ui-state';

type LineKind = 'tool-start' | 'tool-done' | 'tool-error' | 'phase' | 'status' | 'llm' | 'text' | 'request' | 'user' | 'run' | 'agent';

function classifyLine(line: string): LineKind {
  if (line.startsWith('[tool:start]'))  return 'tool-start';
  if (line.startsWith('[tool:done]'))   return 'tool-done';
  if (line.startsWith('[tool:error]'))  return 'tool-error';
  if (line.startsWith('[phase]'))       return 'phase';
  if (line.startsWith('[status]') || line.startsWith('[heartbeat]')) return 'status';
  if (line.startsWith('[llm:'))         return 'llm';
  if (line.startsWith('[request]'))     return 'request';
  if (line.startsWith('[user]'))        return 'user';
  if (line.startsWith('[run]'))         return 'run';
  if (line.startsWith('[agent]'))       return 'agent';
  return 'text';
}

function makeLine(text: string): HTMLElement {
  const div = document.createElement('div');
  div.className = 'log-line';
  div.dataset.kind = classifyLine(text);
  div.textContent = text;
  return div;
}

// Grouped view state
interface GroupedNode {
  el: HTMLElement;
  header: HTMLElement;
  body: HTMLElement;
  descSpan: HTMLElement;
  infoSpan: HTMLElement;
}

let currentTaskNode: GroupedNode | null = null;
let currentToolNode: GroupedNode | null = null;

function createGroupedNode(type: 'task' | 'tool', title: string, info: string, desc: string): GroupedNode {
  const nodeEl = document.createElement('div');
  nodeEl.className = 'grouped-node expanded';
  nodeEl.dataset.type = type;

  const header = document.createElement('div');
  header.className = 'grouped-header';

  const headerContent = document.createElement('div');
  headerContent.className = 'grouped-header-content';

  const row1 = document.createElement('div');
  row1.className = 'grouped-header-row1';

  const titleSpan = document.createElement('span');
  titleSpan.className = `grouped-header-title ${type}`;
  titleSpan.textContent = title;

  const infoSpan = document.createElement('span');
  infoSpan.className = 'grouped-header-info grouped-badge';
  infoSpan.textContent = info;
  if (info === 'Running...') infoSpan.classList.add('running');

  row1.appendChild(titleSpan);
  row1.appendChild(infoSpan);

  const descSpan = document.createElement('div');
  descSpan.className = 'grouped-header-desc';
  descSpan.textContent = desc;

  headerContent.appendChild(row1);
  headerContent.appendChild(descSpan);
  header.appendChild(headerContent);

  const body = document.createElement('div');
  body.className = 'grouped-body';

  nodeEl.appendChild(header);
  nodeEl.appendChild(body);

  header.addEventListener('click', () => {
    nodeEl.classList.toggle('expanded');
  });

  return { el: nodeEl, header, body, descSpan, infoSpan };
}

export function appendLine(text: string): void {
  const out = el.output();
  const atBottom = Math.abs(out.scrollHeight - out.scrollTop - out.clientHeight) < 40;

  const lineEl = makeLine(text);
  out.appendChild(lineEl); // Used for List view

  // Grouped view logic
  const kind = classifyLine(text);
  if (kind === 'request' || kind === 'user') {
    if (!currentTaskNode) {
      currentTaskNode = createGroupedNode('task', 'Task', 'Active', text.replace('[request]', '').replace('[user]', '').trim());
      out.appendChild(currentTaskNode.el);
    } else {
      currentTaskNode.descSpan.textContent = text.replace('[request]', '').replace('[user]', '').trim();
    }
    currentToolNode = null;
  } else if (kind === 'tool-start') {
    const parts = text.replace('[tool:start]', '').trim().split(' ');
    const name = parts[0];
    const details = parts.slice(1).join(' ');
    currentToolNode = createGroupedNode('tool', name, 'Running...', details);

    if (currentTaskNode) {
      currentTaskNode.body.appendChild(currentToolNode.el);
    } else {
      out.appendChild(currentToolNode.el);
    }
  } else if (kind === 'tool-done' || kind === 'tool-error') {
    if (currentToolNode) {
      currentToolNode.infoSpan.classList.remove('running');
      if (kind === 'tool-error') {
        currentToolNode.el.classList.add('error');
        currentToolNode.infoSpan.classList.add('error');
        currentToolNode.infoSpan.textContent = 'Error';
      } else {
        currentToolNode.el.classList.add('done');
        currentToolNode.infoSpan.classList.add('done');
        currentToolNode.infoSpan.textContent = 'Done';
      }
      currentToolNode.body.appendChild(lineEl.cloneNode(true));
      // Auto-collapse done tools
      currentToolNode.el.classList.remove('expanded');
      currentToolNode = null;
    } else if (currentTaskNode) {
      currentTaskNode.body.appendChild(lineEl.cloneNode(true));
    }
  } else if (kind === 'run' || kind === 'agent') {
    if (currentTaskNode) {
      currentTaskNode.body.appendChild(lineEl.cloneNode(true));
      currentTaskNode.el.classList.add('done');
      currentTaskNode.infoSpan.classList.remove('running');
      currentTaskNode.infoSpan.classList.add('done');
      currentTaskNode.infoSpan.textContent = 'Done';
      currentTaskNode = null;
      currentToolNode = null;
    }
  } else {
    // Normal text, LLM chunks, phase, status
    const clone = lineEl.cloneNode(true) as HTMLElement;
    if (currentToolNode) {
      currentToolNode.body.appendChild(clone);
    } else if (currentTaskNode) {
      currentTaskNode.body.appendChild(clone);
    }
  }

  if (atBottom) out.scrollTop = out.scrollHeight;
}

export function replaceOutput(text: string): void {
  const out = el.output();
  out.innerHTML = '';
  currentTaskNode = null;
  currentToolNode = null;

  if (!text) return;
  for (const line of text.split('\n')) {
    if (line.trim().length > 0) appendLine(line);
  }
  out.scrollTop = out.scrollHeight;
}

export function appendOutput(text: string): void {
  for (const line of text.split('\n')) {
    if (line.trim().length > 0) appendLine(line);
  }
}

export function clearOutput(): void {
  el.output().innerHTML = '';
  currentTaskNode = null;
  currentToolNode = null;
}
