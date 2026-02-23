/**
 * log.ts
 * Renders log lines into the output element with semantic colour coding
 * and builds a grouped Thought Grouped.
 */

import { el } from './ui-state';
import { makeIcon } from './icon-service';

type LineKind = 'tool-start' | 'tool-done' | 'tool-error' | 'phase' | 'status' | 'llm' | 'text' | 'request' | 'user' | 'run' | 'agent' | 'channel';
type GroupedNodeType = 'task' | 'tool';
type IconId = LineKind | 'task' | 'session' | 'tool';

interface ParsedLine {
  kind: LineKind;
  message: string;
  icon: IconId;
  label: string;
}

const LINE_META: Record<LineKind, { icon: IconId; label: string }> = {
  'tool-start': { icon: 'tool-start', label: 'TOOL START' },
  'tool-done': { icon: 'tool-done', label: 'TOOL DONE' },
  'tool-error': { icon: 'tool-error', label: 'TOOL ERROR' },
  phase: { icon: 'phase', label: 'PHASE' },
  status: { icon: 'status', label: 'STATUS' },
  llm: { icon: 'llm', label: 'LLM' },
  text: { icon: 'text', label: 'LOG' },
  request: { icon: 'request', label: 'REQUEST' },
  user: { icon: 'user', label: 'USER' },
  run: { icon: 'run', label: 'RUN' },
  agent: { icon: 'agent', label: 'AGENT' },
  channel: { icon: 'channel', label: 'CHANNEL' },
};

function normalizeStructuredLine(line: string): string {
  let normalized = line.trim();
  // extension wrapper: [telegram] [time] ...
  normalized = normalized.replace(/^\[(telegram|whatsapp)\]\s+(?=\[\d{1,2}:\d{2}:\d{2}(?:\s?[AP]M)?\])/i, '');
  // channel internal timestamp: [time] ...
  normalized = normalized.replace(/^\[\d{1,2}:\d{2}:\d{2}(?:\s?[AP]M)?\]\s+/, '');
  return normalized;
}

function classifyLine(line: string): LineKind {
  const normalized = normalizeStructuredLine(line);
  if (normalized.startsWith('[tool:start]'))  return 'tool-start';
  if (normalized.startsWith('[tool:done]'))   return 'tool-done';
  if (normalized.startsWith('[tool:error]'))  return 'tool-error';
  if (normalized.startsWith('[tool:end]')) {
    return /\berror\b|isError=true|error=|failed/i.test(normalized) ? 'tool-error' : 'tool-done';
  }
  if (normalized.startsWith('[phase]'))       return 'phase';
  if (normalized.startsWith('[status]') || normalized.startsWith('[heartbeat]')) return 'status';
  if (normalized.startsWith('[llm:'))         return 'llm';
  if (normalized.startsWith('[request]'))     return 'request';
  if (normalized.startsWith('[user]'))        return 'user';
  if (normalized.startsWith('[run]') || normalized.startsWith('[done]')) return 'run';
  if (normalized.startsWith('[agent]'))       return 'agent';
  if (normalized.startsWith('[telegram]') || normalized.startsWith('[whatsapp]')) return 'channel';
  return 'text';
}

function stripPrefix(line: string): string {
  const normalized = normalizeStructuredLine(line);
  const closing = normalized.indexOf(']');
  if (closing === -1) {
    return normalized.trim();
  }
  return normalized.slice(closing + 1).trim();
}

function parseToolInvocation(line: string, prefix: '[tool:start]' | '[tool:done]' | '[tool:error]'): { name: string; details: string } {
  const normalized = normalizeStructuredLine(line);
  const compatiblePrefix = prefix === '[tool:done]' && normalized.startsWith('[tool:end]') ? '[tool:end]' : prefix;
  const payload = normalized.replace(compatiblePrefix, '').trim();
  if (payload.length === 0) {
    return { name: 'tool', details: '' };
  }
  const [name, ...rest] = payload.split(/\s+/);
  return { name, details: rest.join(' ') };
}

function parseLine(line: string): ParsedLine {
  const kind = classifyLine(line);
  const meta = LINE_META[kind];
  const message = kind === 'text' ? line.trim() : stripPrefix(line);
  return {
    kind,
    message: message.length > 0 ? message : line.trim(),
    icon: meta.icon,
    label: meta.label,
  };
}

function makeLine(text: string): HTMLElement {
  const parsed = parseLine(text);
  const div = document.createElement('div');
  div.className = 'log-line';
  div.dataset.kind = parsed.kind;

  const icon = makeIcon(parsed.icon, 'log-icon');

  const kind = document.createElement('span');
  kind.className = 'log-kind';
  kind.textContent = parsed.label;

  const message = document.createElement('span');
  message.className = 'log-message';
  message.textContent = parsed.message;

  div.title = text;
  div.appendChild(icon);
  div.appendChild(kind);
  div.appendChild(message);
  return div;
}

// Grouped view state
interface GroupedNode {
  el: HTMLElement;
  header: HTMLElement;
  body: HTMLElement;
  descSpan: HTMLElement;
  infoSpan: HTMLElement;
  titleSpan: HTMLElement;
}

let currentTaskNode: GroupedNode | null = null;
let currentToolNode: GroupedNode | null = null;
let currentSystemNode: GroupedNode | null = null;
let streamText = '';
let streamListLine: HTMLElement | null = null;
let streamGroupedLine: HTMLElement | null = null;

function createGroupedNode(type: GroupedNodeType, title: string, info: string, desc: string, icon: IconId): GroupedNode {
  const nodeEl = document.createElement('div');
  nodeEl.className = 'grouped-node expanded';
  nodeEl.dataset.type = type;

  const header = document.createElement('div');
  header.className = 'grouped-header';

  const headerContent = document.createElement('div');
  headerContent.className = 'grouped-header-content';

  const row1 = document.createElement('div');
  row1.className = 'grouped-header-row1';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'grouped-title-wrap';

  const iconSpan = makeIcon(icon, 'grouped-title-icon');

  const titleSpan = document.createElement('span');
  titleSpan.className = `grouped-header-title ${type}`;
  titleSpan.textContent = title;

  titleWrap.appendChild(iconSpan);
  titleWrap.appendChild(titleSpan);

  const infoSpan = document.createElement('span');
  infoSpan.className = 'grouped-header-info grouped-badge';
  infoSpan.textContent = info;
  if (info === 'Running...') infoSpan.classList.add('running');

  row1.appendChild(titleWrap);
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

  return { el: nodeEl, header, body, descSpan, infoSpan, titleSpan };
}

function ensureSystemNode(out: HTMLElement): GroupedNode {
  if (currentSystemNode) {
    return currentSystemNode;
  }
  currentSystemNode = createGroupedNode('task', 'Session', 'Active', 'Initialization and runtime status', 'session');
  out.appendChild(currentSystemNode.el);
  return currentSystemNode;
}

function setLineText(line: HTMLElement, text: string): HTMLElement {
  const updated = makeLine(text);
  line.replaceWith(updated);
  return updated;
}

function appendToCurrentGroupedContext(line: HTMLElement, out: HTMLElement): HTMLElement | null {
  const clone = line.cloneNode(true) as HTMLElement;
  if (currentToolNode) {
    currentToolNode.body.appendChild(clone);
    return clone;
  }
  if (currentTaskNode) {
    currentTaskNode.body.appendChild(clone);
    return clone;
  }
  const systemNode = ensureSystemNode(out);
  systemNode.body.appendChild(clone);
  return clone;
}

function beginOrUpdateStreamingText(chunk: string): void {
  if (chunk.length === 0) {
    return;
  }
  const out = el.output();
  streamText += chunk;
  if (!streamListLine) {
    streamListLine = makeLine(streamText);
    out.appendChild(streamListLine);
    streamGroupedLine = appendToCurrentGroupedContext(streamListLine, out);
    return;
  }
  streamListLine = setLineText(streamListLine, streamText);
  if (streamGroupedLine) {
    streamGroupedLine = setLineText(streamGroupedLine, streamText);
  }
}

function finalizeStreamingText(): void {
  streamText = '';
  streamListLine = null;
  streamGroupedLine = null;
}

export function appendLine(text: string): void {
  const out = el.output();
  const atBottom = Math.abs(out.scrollHeight - out.scrollTop - out.clientHeight) < 40;

  const lineEl = makeLine(text);
  out.appendChild(lineEl); // Used for List view

  // Grouped view logic
  const parsed = parseLine(text);
  const kind = parsed.kind;
  if (kind !== 'text') {
    finalizeStreamingText();
  }
  if (kind === 'request' || kind === 'user') {
    currentSystemNode = null;
    if (!currentTaskNode) {
      currentTaskNode = createGroupedNode('task', kind === 'request' ? 'Task request' : 'User message', 'Active', parsed.message, 'task');
      out.appendChild(currentTaskNode.el);
    } else {
      currentTaskNode.descSpan.textContent = parsed.message;
    }
    currentToolNode = null;
  } else if (kind === 'tool-start') {
    const { name, details } = parseToolInvocation(text, '[tool:start]');
    currentToolNode = createGroupedNode('tool', name, 'Running...', details || 'Executing tool...', 'tool');

    if (currentTaskNode) {
      currentTaskNode.body.appendChild(currentToolNode.el);
    } else {
      out.appendChild(currentToolNode.el);
    }
  } else if (kind === 'tool-done' || kind === 'tool-error') {
    const { name, details } = parseToolInvocation(text, kind === 'tool-done' ? '[tool:done]' : '[tool:error]');
    if (currentToolNode) {
      currentToolNode.infoSpan.classList.remove('running');
      if (name.length > 0) {
        currentToolNode.titleSpan.textContent = name;
      }
      if (details.length > 0) {
        currentToolNode.descSpan.textContent = details;
      }
      if (kind === 'tool-error') {
        currentToolNode.el.classList.add('error');
        currentToolNode.infoSpan.classList.add('error');
        currentToolNode.infoSpan.textContent = 'Error';
      } else {
        currentToolNode.el.classList.add('done');
        currentToolNode.infoSpan.classList.add('done');
        const duration = details.match(/\b\d+ms\b/)?.[0];
        currentToolNode.infoSpan.textContent = duration ? `Done ${duration}` : 'Done';
      }
      currentToolNode.body.appendChild(lineEl.cloneNode(true));
      // Auto-collapse done tools
      if (kind === 'tool-done') {
        currentToolNode.el.classList.remove('expanded');
      }
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
    } else {
      const systemNode = ensureSystemNode(out);
      systemNode.body.appendChild(lineEl.cloneNode(true));
      if (kind === 'run') {
        systemNode.infoSpan.classList.remove('running');
        systemNode.infoSpan.classList.add('done');
        systemNode.infoSpan.textContent = 'Ready';
      }
    }
  } else {
    // Normal text, LLM chunks, phase, status
    const clone = lineEl.cloneNode(true) as HTMLElement;
    if (currentToolNode) {
      currentToolNode.body.appendChild(clone);
    } else if (currentTaskNode) {
      currentTaskNode.body.appendChild(clone);
    } else {
      const systemNode = ensureSystemNode(out);
      systemNode.body.appendChild(clone);
    }
  }

  if (atBottom) out.scrollTop = out.scrollHeight;
}

export function replaceOutput(text: string): void {
  const out = el.output();
  out.innerHTML = '';
  currentTaskNode = null;
  currentToolNode = null;
  currentSystemNode = null;
  finalizeStreamingText();

  if (!text) return;
  for (const line of text.split('\n')) {
    if (line.trim().length > 0) appendLine(line);
  }
  out.scrollTop = out.scrollHeight;
}

export function appendOutput(text: string): void {
  if (text.length === 0) {
    return;
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.length === 0) {
      if (i < lines.length - 1) {
        finalizeStreamingText();
      }
      continue;
    }

    const kind = classifyLine(line);
    if (kind !== 'text') {
      finalizeStreamingText();
      appendLine(line);
      continue;
    }

    beginOrUpdateStreamingText(line);
    if (i < lines.length - 1) {
      finalizeStreamingText();
    }
  }
}

export function clearOutput(): void {
  el.output().innerHTML = '';
  currentTaskNode = null;
  currentToolNode = null;
  currentSystemNode = null;
  finalizeStreamingText();
}
