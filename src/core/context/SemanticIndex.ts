import * as vscode from 'vscode';

const MAX_INDEX_FILES = 1200;
const MAX_FILE_BYTES = 200000;
const MAX_TOKENS_PER_FILE = 200;
const REBUILD_INTERVAL_MS = 5 * 60 * 1000;
const REBUILD_DEBOUNCE_MS = 1500;
const INCLUDE_GLOB = '**/*.{ts,tsx,js,jsx,py,go,java,cs,rb,php,rs,kt,swift,cpp,c,h,hpp,md,mdx,json,yaml,yml,html,css,scss}';
const EXCLUDE_REGEX = /[\\/](node_modules|\.git|dist|out|build)[\\/]/;

type TokenMap = Map<string, number>;

interface FileVector {
  path: string;
  tokens: TokenMap;
  norm: number;
}

export interface SemanticSearchResult {
  path: string;
  score: number;
}

export class SemanticIndex {
  private static _instance: SemanticIndex;
  private _fileVectors = new Map<string, FileVector>();
  private _inverted = new Map<string, Array<{ path: string; weight: number }>>();
  private _idf = new Map<string, number>();
  private _lastBuilt = 0;
  private _workspaceKey = '';
  private _dirty = true;
  private _rebuildAfter = 0;
  private _watcher?: vscode.FileSystemWatcher;

  private constructor() {}

  static getInstance(): SemanticIndex {
    if (!SemanticIndex._instance) {
      SemanticIndex._instance = new SemanticIndex();
    }
    return SemanticIndex._instance;
  }

  initWatcher(): vscode.Disposable {
    if (this._watcher) return this._watcher;

    this._watcher = vscode.workspace.createFileSystemWatcher(INCLUDE_GLOB);
    const handler = (uri: vscode.Uri) => {
      if (!this.isWorkspaceIndexEnabled()) return;
      if (this.shouldIgnorePath(uri.fsPath)) return;
      this.markDirty();
    };

    this._watcher.onDidChange(handler);
    this._watcher.onDidCreate(handler);
    this._watcher.onDidDelete(handler);

    return this._watcher;
  }

  private getWorkspaceKey(): string {
    return vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath).join('|') || '';
  }

  private isWorkspaceIndexEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('aisCode');
    return config.get<boolean>('workspaceIndex') ?? true;
  }

  private shouldIgnorePath(path: string): boolean {
    return EXCLUDE_REGEX.test(path);
  }

  private markDirty() {
    this._dirty = true;
    this._rebuildAfter = Date.now() + REBUILD_DEBOUNCE_MS;
  }

  private tokenize(text: string): string[] {
    const matches = text.match(/[\p{L}_][\p{L}\p{N}_]+/gu) || [];
    return matches.map(token => token.toLowerCase());
  }

  private buildTf(tokens: string[]): TokenMap {
    const counts = new Map<string, number>();
    for (const token of tokens) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
    return counts;
  }

  private limitTopTokens(tf: TokenMap): TokenMap {
    const entries = Array.from(tf.entries()).sort((a, b) => b[1] - a[1]).slice(0, MAX_TOKENS_PER_FILE);
    return new Map(entries);
  }

  private async buildIndex(force = false) {
    const now = Date.now();
    const workspaceKey = this.getWorkspaceKey();
    const workspaceChanged = workspaceKey !== this._workspaceKey;
    if (workspaceChanged) {
      this._dirty = true;
      this._rebuildAfter = 0;
    }
    if (!force && !this._dirty && this._lastBuilt && now - this._lastBuilt < REBUILD_INTERVAL_MS && !workspaceChanged) {
      return;
    }
    if (!force && this._dirty && now < this._rebuildAfter && !workspaceChanged) {
      return;
    }

    this._workspaceKey = workspaceKey;
    this._fileVectors.clear();
    this._inverted.clear();
    this._idf.clear();

    const include = INCLUDE_GLOB;
    const exclude = '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**}';

    const uris = await vscode.workspace.findFiles(include, exclude, MAX_INDEX_FILES);
    const docFreq = new Map<string, number>();
    const fileCount = uris.length || 1;

    for (const uri of uris) {
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.size > MAX_FILE_BYTES) continue;
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = new TextDecoder().decode(bytes);
        const tokens = this.tokenize(text);
        if (tokens.length === 0) continue;
        const tf = this.limitTopTokens(this.buildTf(tokens));
        this._fileVectors.set(uri.fsPath, { path: uri.fsPath, tokens: tf, norm: 0 });
        for (const token of tf.keys()) {
          docFreq.set(token, (docFreq.get(token) || 0) + 1);
        }
      } catch {
        // Ignore unreadable files
      }
    }

    for (const [token, df] of docFreq.entries()) {
      const idf = Math.log((fileCount + 1) / (df + 1)) + 1;
      this._idf.set(token, idf);
    }

    for (const fileVector of this._fileVectors.values()) {
      let norm = 0;
      for (const [token, tf] of fileVector.tokens.entries()) {
        const idf = this._idf.get(token) || 0;
        const weight = tf * idf;
        norm += weight * weight;
        if (!this._inverted.has(token)) {
          this._inverted.set(token, []);
        }
        this._inverted.get(token)?.push({ path: fileVector.path, weight });
      }
      fileVector.norm = Math.sqrt(norm);
    }

    this._lastBuilt = now;
    this._dirty = false;
  }

  async search(query: string, topK = 6): Promise<SemanticSearchResult[]> {
    await this.buildIndex();
    const tokens = this.tokenize(query);
    if (tokens.length === 0) return [];

    const tf = this.buildTf(tokens);
    const queryWeights = new Map<string, number>();
    let queryNorm = 0;
    for (const [token, count] of tf.entries()) {
      const idf = this._idf.get(token);
      if (!idf) continue;
      const weight = count * idf;
      queryWeights.set(token, weight);
      queryNorm += weight * weight;
    }
    queryNorm = Math.sqrt(queryNorm);
    if (queryNorm === 0) return [];

    const scores = new Map<string, number>();
    for (const [token, qWeight] of queryWeights.entries()) {
      const postings = this._inverted.get(token);
      if (!postings) continue;
      for (const entry of postings) {
        scores.set(entry.path, (scores.get(entry.path) || 0) + qWeight * entry.weight);
      }
    }

    const results: SemanticSearchResult[] = [];
    for (const [path, dot] of scores.entries()) {
      const norm = this._fileVectors.get(path)?.norm || 1;
      const score = dot / (norm * queryNorm);
      results.push({ path, score });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}
