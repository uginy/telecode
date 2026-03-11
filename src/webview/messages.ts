/**
 * messages.ts
 * All incoming messages from the extension → webview.
 */

import { setStatus, setPhaseText, setControlState, setChannelsToggleState, setTab, el } from './ui-state';
import { appendOutput, replaceOutput, clearOutput, appendLine } from './log';
import { writeForm } from './settings';
import type { Settings } from './commands';
import { renderTaskResultCard } from './task-result';
import type { TaskReviewSummary } from '../extension/taskReview';

type IncomingMessage =
  | { type: 'status';   text: string }
  | { type: 'channelsState'; connected: boolean }
  | { type: 'progress'; text: string; busy: boolean }
  | { type: 'replaceOutput'; text: string }
  | { type: 'appendOutput';  text: string }
  | { type: 'clearOutput' }
  | { type: 'notify';   text: string }
  | { type: 'settings'; settings: Settings }
  | { type: 'taskResult'; result: TaskReviewSummary | null }
  | { type: 'activateTab'; tab: string }
  | { type: 'modelList'; models: string[] }
  | { type: 'buildInfo'; text: string }
  | { type: 'translate'; translations: Record<string, string> };

export function handleMessage(raw: unknown): void {
  const msg = raw as IncomingMessage;

  switch (msg.type) {
    case 'status':
      setStatus(msg.text);
      setControlState(msg.text);
      break;

    case 'channelsState':
      setChannelsToggleState(msg.connected === true);
      break;

    case 'progress':
      {
        const text = (msg.text ?? '').trim();
        const lower = text.toLowerCase();
        const isIdleLike =
          lower === 'idle' ||
          lower === 'ready' ||
          lower.startsWith('idle •') ||
          lower.startsWith('ready •');
        setPhaseText(msg.busy || !isIdleLike ? text : '');
        el.phase().dataset.busy = msg.busy ? '1' : '0';
      }
      break;

    case 'replaceOutput':
      replaceOutput(msg.text);
      break;

    case 'appendOutput':
      appendOutput(msg.text);
      break;

    case 'clearOutput':
      clearOutput();
      break;

    case 'notify':
      if (typeof msg.text === 'string') {
        appendLine(`[settings] ${msg.text}`);
        el.settingsNote().textContent = msg.text;
      }
      break;

    case 'settings':
      if (msg.settings) writeForm(msg.settings);
      break;

    case 'taskResult':
      renderTaskResultCard(msg.result);
      break;

    case 'activateTab':
      if (msg.tab === 'settings') setTab('settings');
      break;

    case 'modelList':
      if (Array.isArray(msg.models)) {
        // We'll dispatch this to a UI helper later
        window.dispatchEvent(new CustomEvent('models-loaded', { detail: msg.models }));
      }
      break;

    case 'buildInfo':
      if (typeof msg.text === 'string') {
        window.dispatchEvent(new CustomEvent('build-info', { detail: msg.text }));
      }
      break;

    case 'translate':
      if (msg.translations) {
        window.dispatchEvent(new CustomEvent('translate', { detail: msg.translations }));
      }
      break;
  }
}
