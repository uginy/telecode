/**
 * settings.ts
 * Reads/writes the settings form fields. Isolated from message/command logic.
 */

import type { Settings } from './commands';
import { renderProviderOptions, renderThinkingOptions, syncProviderFields } from './provider-picker';

const $ = (id: string) => document.getElementById(id);

/** Saved keys of every provider; the API key field shows only the selected one. */
let apiKeys: Record<string, string> = {};
/** Level the user asked for; the select may show a lower one the current model supports. */
let wantedThinking = 'off';

export function getWantedThinking(): string {
  return wantedThinking;
}
export function setWantedThinking(level: string): void {
  wantedThinking = level;
}

/** Keeps the key typed for `from` and shows the one saved for `to`. */
export function swapProviderKey(from: string, to: string): void {
  apiKeys[from] = strVal('apiKey');
  setStr('apiKey', apiKeys[to] ?? '');
}

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
  const logMaxCharsRaw = Number.parseInt(strVal('logMaxChars') || '500000', 10);
  const logMaxChars = Number.isFinite(logMaxCharsRaw) && logMaxCharsRaw > 0 ? logMaxCharsRaw : 500000;
  const channelLogLinesRaw = Number.parseInt(strVal('channelLogLines') || '300', 10);
  const channelLogLines = Number.isFinite(channelLogLinesRaw) && channelLogLinesRaw > 0 ? channelLogLinesRaw : 300;

  const provider = strVal('provider');
  return {
    provider,
    model:             strVal('model'),
    apiKey:            strVal('apiKey'),
    apiKeys:           { ...apiKeys, [provider]: strVal('apiKey') },
    thinkingLevel:     strVal('thinkingLevel') || 'off',
    baseUrl:           strVal('baseUrl'),
    maxSteps,
    responseStyle:     strVal('responseStyle'),
    language:          strVal('language'),
    uiLanguage:        strVal('uiLanguage'),
    statusVerbosity:   strVal('statusVerbosity'),
    safeModeProfile:   strVal('safeModeProfile'),
    allowOutOfWorkspace: boolVal('allowOutOfWorkspace'),
    logMaxChars,
    channelLogLines,
    telegramEnabled:   boolVal('telegramEnabled'),
    telegramBotToken:  strVal('telegramBotToken'),
    telegramChatId:    strVal('telegramChatId'),
    telegramApiRoot:   strVal('telegramApiRoot'),
    telegramForceIPv4: boolVal('telegramForceIPv4'),
    whatsappEnabled:   boolVal('whatsappEnabled'),
    whatsappSessionPath: strVal('whatsappSessionPath'),
    whatsappAllowSelfCommands: boolVal('whatsappAllowSelfCommands'),
    whatsappAccessMode: (strVal('whatsappAccessMode') as 'self' | 'allowlist' | 'all') || 'self',
    whatsappAllowedPhones: strVal('whatsappAllowedPhones'),
  };
}

export function writeForm(s: Settings): void {
  apiKeys = { ...(s.apiKeys ?? {}) };
  wantedThinking = s.thinkingLevel ?? 'off';
  const providerSelect = $('provider') as HTMLSelectElement | null;
  if (providerSelect) renderProviderOptions(providerSelect, s.provider ?? '');
  setStr( 'model',            s.model ?? '');
  setStr( 'apiKey',           s.apiKey ?? '');
  setStr( 'baseUrl',          s.baseUrl ?? '');
  syncProviderFields(s.provider ?? '', s.baseUrl ?? '');
  const thinkingSelect = $('thinkingLevel') as HTMLSelectElement | null;
  if (thinkingSelect) renderThinkingOptions(thinkingSelect, undefined, wantedThinking);
  setStr( 'maxSteps',         String(s.maxSteps ?? 100));
  setStr( 'responseStyle',    s.responseStyle ?? 'concise');
  setStr( 'language',         s.language ?? 'auto');
  setStr( 'uiLanguage',       s.uiLanguage ?? 'auto');
  setStr( 'statusVerbosity',  s.statusVerbosity ?? 'normal');
  setStr( 'safeModeProfile',  s.safeModeProfile ?? 'balanced');
  setBool('allowOutOfWorkspace', s.allowOutOfWorkspace === true);
  setStr( 'logMaxChars',      String(s.logMaxChars ?? 500000));
  setStr( 'channelLogLines', String(s.channelLogLines ?? 300));
  setBool('telegramEnabled',  s.telegramEnabled === true);
  setStr( 'telegramBotToken', s.telegramBotToken ?? '');
  setStr( 'telegramChatId',   s.telegramChatId ?? '');
  setStr( 'telegramApiRoot',  s.telegramApiRoot ?? '');
  setBool('telegramForceIPv4', s.telegramForceIPv4 !== false);
  setBool('whatsappEnabled', s.whatsappEnabled === true);
  setStr( 'whatsappSessionPath', s.whatsappSessionPath ?? '~/.telecode-ai/whatsapp-session.json');
  setBool('whatsappAllowSelfCommands', s.whatsappAllowSelfCommands !== false);
  setStr( 'whatsappAccessMode', s.whatsappAccessMode ?? 'self');
  setStr( 'whatsappAllowedPhones', s.whatsappAllowedPhones ?? '');
}
