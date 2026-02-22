/**
 * settings.ts
 * Reads/writes the settings form fields. Isolated from message/command logic.
 */

import type { Settings } from './commands';

const $ = (id: string) => document.getElementById(id);

function strVal(id: string): string {
  return (($(id) as HTMLInputElement)?.value ?? '').trim();
}
function boolVal(id: string): boolean {
  return !!($(id) as HTMLInputElement)?.checked;
}
function setStr(id: string, val: string): void {
  const el = $(id) as HTMLInputElement | null;
  if (el) el.value = val;
}
function setBool(id: string, val: boolean): void {
  const el = $(id) as HTMLInputElement | null;
  if (el) el.checked = val;
}

export function readForm(): Settings {
  const maxStepsRaw = Number.parseInt(strVal('maxSteps') || '100', 10);
  const maxSteps = Number.isFinite(maxStepsRaw) && maxStepsRaw > 0 ? maxStepsRaw : 100;

  return {
    provider:          strVal('provider'),
    model:             strVal('model'),
    apiKey:            strVal('apiKey'),
    baseUrl:           strVal('baseUrl'),
    maxSteps,
    responseStyle:     strVal('responseStyle'),
    language:          strVal('language'),
    uiLanguage:        strVal('uiLanguage'),
    allowOutOfWorkspace: boolVal('allowOutOfWorkspace'),
    telegramEnabled:   boolVal('telegramEnabled'),
    telegramBotToken:  strVal('telegramBotToken'),
    telegramChatId:    strVal('telegramChatId'),
    telegramApiRoot:   strVal('telegramApiRoot'),
    telegramForceIPv4: boolVal('telegramForceIPv4'),
  };
}

export function writeForm(s: Settings): void {
  setStr( 'provider',         s.provider ?? '');
  setStr( 'model',            s.model ?? '');
  setStr( 'apiKey',           s.apiKey ?? '');
  setStr( 'baseUrl',          s.baseUrl ?? '');
  setStr( 'maxSteps',         String(s.maxSteps ?? 100));
  setStr( 'responseStyle',    s.responseStyle ?? 'concise');
  setStr( 'language',         s.language ?? 'ru');
  setStr( 'uiLanguage',       s.uiLanguage ?? 'ru');
  setBool('allowOutOfWorkspace', s.allowOutOfWorkspace === true);
  setBool('telegramEnabled',  s.telegramEnabled === true);
  setStr( 'telegramBotToken', s.telegramBotToken ?? '');
  setStr( 'telegramChatId',   s.telegramChatId ?? '');
  setStr( 'telegramApiRoot',  s.telegramApiRoot ?? '');
  setBool('telegramForceIPv4', s.telegramForceIPv4 !== false);
}
