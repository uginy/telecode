/**
 * messages.ts
 * All incoming messages from the extension → webview.
 */

import { setStatus, setPhaseText, setControlState, setTab, el } from './ui-state';
import { appendOutput, replaceOutput, clearOutput, appendLine } from './log';
import { writeForm } from './settings';
import type { Settings } from './commands';

type IncomingMessage =
  | { type: 'status';   text: string }
  | { type: 'progress'; text: string; busy: boolean }
  | { type: 'replaceOutput'; text: string }
  | { type: 'appendOutput';  text: string }
  | { type: 'clearOutput' }
  | { type: 'notify';   text: string }
  | { type: 'settings'; settings: Settings }
  | { type: 'activateTab'; tab: string }
  | { type: 'buildInfo'; text: string };

export function handleMessage(raw: unknown): void {
  const msg = raw as IncomingMessage;

  switch (msg.type) {
    case 'status':
      setStatus(msg.text);
      setControlState(msg.text);
      break;

    case 'progress':
      setPhaseText(msg.text ?? '');
      el.phase().dataset['busy'] = msg.busy ? '1' : '0';
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

    case 'activateTab':
      if (msg.tab === 'settings') setTab('settings');
      break;

    case 'buildInfo':
      // no-op: buildInfo badge removed from new UI
      break;
  }
}
