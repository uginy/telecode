import * as vscode from 'vscode';
import { getWorkspaceSummary, resolveWorkspacePath } from '../../utils/workspace';
import { TerminalHistory } from '../../core/tools/TerminalHistory';

const MAX_TOTAL_CONTEXT_CHARS = 120000;
const MAX_FILE_CONTEXT_CHARS = 20000;
const MAX_SNIPPET_CONTEXT_CHARS = 4000;
const MAX_OPEN_TABS = 8;
const MAX_SEARCH_SNIPPETS = 8;
const MAX_FOLDER_FILES = 40;

interface ContextState {
  content: string;
  used: number;
}

interface ContextBuildResult {
  workspaceSummary: string;
  contextDetails: string;
  usedSearch: boolean;
}

function appendContext(state: ContextState, chunk: string) {
  if (state.used >= MAX_TOTAL_CONTEXT_CHARS) return;
  const remaining = MAX_TOTAL_CONTEXT_CHARS - state.used;
  const sliced = chunk.length > remaining ? `${chunk.slice(0, remaining)}\n[...truncated]` : chunk;
  state.content += sliced;
  state.used += sliced.length;
}

function getOpenTabUris(): vscode.Uri[] {
  const uris: vscode.Uri[] = [];
  const seen = new Set<string>();

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText) {
        const uri = tab.input.uri;
        if (uri.scheme !== 'file') continue;
        const key = uri.toString();
        if (!seen.has(key)) {
          seen.add(key);
          uris.push(uri);
        }
      }
    }
  }

  return uris;
}

async function getDocumentText(uri: vscode.Uri): Promise<string> {
  const existing = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
  if (existing) return existing.getText();
  const doc = await vscode.workspace.openTextDocument(uri);
  return doc.getText();
}

function getVisibleRanges(uri: vscode.Uri): vscode.Range[] {
  const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
  if (!editor) return [];
  return editor.visibleRanges;
}

function expandRange(range: vscode.Range, totalLines: number, paddingLines = 20) {
  const start = Math.max(0, range.start.line - paddingLines);
  const end = Math.min(totalLines, range.end.line + paddingLines);
  return new vscode.Range(start, 0, end, 0);
}

function extractRangeText(lines: string[], range: vscode.Range, maxChars: number) {
  const start = Math.max(0, range.start.line);
  const end = Math.min(lines.length, range.end.line);
  let snippet = lines.slice(start, end).join('\n');
  if (snippet.length > maxChars) {
    snippet = `${snippet.slice(0, maxChars)}\n[...truncated]`;
  }
  return snippet;
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the','a','an','and','or','to','of','in','on','for','with','at','by','from','is','are','was','were','be','been','this','that','it','as',
    'как','что','это','в','на','и','или','для','из','по','с','к','от','мы','вы','они','он','она','оно','бы','быть','не','да','нет'
  ]);

  const tokens = text
    .replace(/[^\p{L}\p{N}_\-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(token => token.trim())
    .filter(token => token.length >= 3)
    .filter(token => !stopWords.has(token.toLowerCase()));

  const unique = Array.from(new Set(tokens));
  return unique.slice(0, 6);
}

async function collectSearchSnippets(state: ContextState, keywords: string[]) {
  if (keywords.length === 0) return false;

  const results: Array<{ uri: vscode.Uri; line: number }> = [];
  const pattern = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const exclude = '{**/node_modules/**,**/dist/**,**/.git/**,**/out/**,**/build/**}';

  await vscode.workspace.findTextInFiles(
    { pattern, isRegExp: true },
    { include: '**/*', exclude, maxResults: MAX_SEARCH_SNIPPETS },
    (result) => {
      if (results.length >= MAX_SEARCH_SNIPPETS) return;
      const line = result.ranges[0]?.recognized ? result.ranges[0].recognized.start.line : result.ranges[0].start.line;
      results.push({ uri: result.uri, line });
    }
  );

  if (results.length === 0) return false;

  appendContext(state, '\n[Context: Codebase Matches]\n');

  for (const match of results) {
    if (state.used >= MAX_TOTAL_CONTEXT_CHARS) break;
    const text = await getDocumentText(match.uri);
    const lines = text.split(/\r?\n/);
    const start = Math.max(0, match.line - 12);
    const end = Math.min(lines.length, match.line + 12);
    const snippet = lines.slice(start, end).join('\n');
    const relativePath = vscode.workspace.asRelativePath(match.uri);
    appendContext(
      state,
      `File: ${relativePath}\nSnippet:\n\`\`\`\n${snippet.slice(0, MAX_SNIPPET_CONTEXT_CHARS)}\n\`\`\`\n`
    );
  }

  return true;
}

async function appendOpenTabContext(state: ContextState, lastActiveEditor?: vscode.TextEditor) {
  const openUris = getOpenTabUris();
  const activeUri = vscode.window.activeTextEditor?.document.uri || lastActiveEditor?.document.uri;

  if (openUris.length === 0 && activeUri) {
    openUris.push(activeUri);
  }

  if (openUris.length === 0) return;

  appendContext(state, '\n[Context: Open Tabs]\n');

  for (const uri of openUris.slice(0, MAX_OPEN_TABS)) {
    if (state.used >= MAX_TOTAL_CONTEXT_CHARS) break;
    const relativePath = vscode.workspace.asRelativePath(uri);
    const isActive = activeUri && uri.toString() === activeUri.toString();
    const label = isActive ? `${relativePath} (active)` : relativePath;
    const text = await getDocumentText(uri);
    const lines = text.split(/\r?\n/);
    const visibleRanges = getVisibleRanges(uri);

    let snippet = '';
    if (visibleRanges.length > 0) {
      const expanded = visibleRanges.map(range => expandRange(range, lines.length));
      for (const range of expanded) {
        if (snippet.length >= MAX_FILE_CONTEXT_CHARS) break;
        snippet += `${extractRangeText(lines, range, MAX_FILE_CONTEXT_CHARS - snippet.length)}\n`;
      }
    } else {
      snippet = text.slice(0, MAX_FILE_CONTEXT_CHARS);
    }

    appendContext(
      state,
      `File: ${label}\nContent:\n\`\`\`\n${snippet}\n\`\`\`\n`
    );
  }
}

async function appendExplicitContext(
  state: ContextState,
  contextItems: { type: string; value: string }[]
) {
  appendContext(state, '\n[Explicit Context Items]\n');
  for (const item of contextItems) {
    if (state.used >= MAX_TOTAL_CONTEXT_CHARS) break;
    try {
      if (item.type === 'file') {
        const uris = await vscode.workspace.findFiles(item.value, null, 1);
        if (uris.length > 0) {
          const text = await getDocumentText(uris[0]);
          const trimmed = text.slice(0, MAX_FILE_CONTEXT_CHARS);
          appendContext(state, `File: ${item.value}\nContent:\n\`\`\`\n${trimmed}\n\`\`\`\n`);
        }
      } else if (item.type === 'folder') {
        const resolved = resolveWorkspacePath(item.value);
        if (!resolved.resolvedPath) continue;
        const folderUri = vscode.Uri.file(resolved.resolvedPath);
        const files = await vscode.workspace.findFiles(
          new vscode.RelativePattern(folderUri.fsPath, '**/*'),
          '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**}',
          MAX_FOLDER_FILES
        );
        const listed = files.map(uri => vscode.workspace.asRelativePath(uri)).join('\n');
        appendContext(state, `Folder: ${item.value}\nFiles:\n${listed}\n`);
      } else if (item.type === 'terminal') {
        const entries = TerminalHistory.getRecent();
        const formatted = entries
          .map(entry => `[${new Date(entry.timestamp).toLocaleTimeString()}] $ ${entry.command}\n${entry.output}`)
          .join('\n\n');
        appendContext(state, `Terminal: ${item.value}\n${formatted}\n`);
      }
    } catch (e) {
      console.warn(`Failed to read context item ${item.value}:`, e);
    }
  }
}

function appendTerminalSummary(state: ContextState) {
  const terminals = vscode.window.terminals;
  if (terminals.length === 0) return;
  const names = terminals.map(t => t.name).join(', ');
  appendContext(state, `\n[Context: Terminals]\n${names}\n`);
}

export async function buildContext(params: {
  text: string;
  contextItems?: { type: string; value: string }[];
  lastActiveEditor?: vscode.TextEditor;
}): Promise<ContextBuildResult> {
  const state: ContextState = { content: '', used: 0 };
  const summary = await getWorkspaceSummary();
  const hasExplicitContext = !!(params.contextItems && params.contextItems.length > 0);
  const hasMentions = params.text.includes('@');
  const shouldUseOpenTabs = !hasExplicitContext && !hasMentions;

  if (hasExplicitContext) {
    await appendExplicitContext(state, params.contextItems || []);
  }

  if (shouldUseOpenTabs) {
    await appendOpenTabContext(state, params.lastActiveEditor);
    appendTerminalSummary(state);
  }

  const keywords = extractKeywords(params.text);
  let usedSearch = false;

  if (!hasExplicitContext && keywords.length > 0 && state.used < MAX_TOTAL_CONTEXT_CHARS * 0.6) {
    usedSearch = await collectSearchSnippets(state, keywords);
  }

  return {
    workspaceSummary: summary,
    contextDetails: state.content,
    usedSearch
  };
}
