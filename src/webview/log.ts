/**
 * log.ts
 * Renders log lines into the output element with semantic colour coding.
 * Each line gets a data-kind attribute that CSS uses for colouring.
 */

import { el } from './ui-state';

type LineKind = 'tool-start' | 'tool-done' | 'tool-error' | 'phase' | 'status' | 'llm' | 'text';

function classifyLine(line: string): LineKind {
  if (line.startsWith('[tool:start]'))  return 'tool-start';
  if (line.startsWith('[tool:done]'))   return 'tool-done';
  if (line.startsWith('[tool:error]'))  return 'tool-error';
  if (line.startsWith('[phase]'))       return 'phase';
  if (line.startsWith('[status]') || line.startsWith('[heartbeat]')) return 'status';
  if (line.startsWith('[llm:'))         return 'llm';
  return 'text';
}

function makeLine(text: string): HTMLElement {
  const div = document.createElement('div');
  div.className = 'log-line';
  div.dataset['kind'] = classifyLine(text);
  div.textContent = text;
  return div;
}

export function appendLine(text: string): void {
  const out = el.output();
  const atBottom = out.scrollHeight - out.scrollTop - out.clientHeight < 40;
  out.appendChild(makeLine(text));
  if (atBottom) out.scrollTop = out.scrollHeight;
}

export function replaceOutput(text: string): void {
  const out = el.output();
  out.innerHTML = '';
  if (!text) return;
  for (const line of text.split('\n')) {
    out.appendChild(makeLine(line));
  }
  out.scrollTop = out.scrollHeight;
}

export function appendOutput(text: string): void {
  for (const line of text.split('\n')) {
    appendLine(line);
  }
}

export function clearOutput(): void {
  el.output().innerHTML = '';
}
