import * as vscode from 'vscode';
import * as path from 'node:path';
import { resolveWorkspacePath } from '../../utils/workspace';

interface TrackedFileEntry {
  absolutePath: string;
  relativePath: string;
  lastReadAt: number;
  lastKnownMtime?: number;
}

export class FileContextTracker implements vscode.Disposable {
  private static _instance: FileContextTracker | null = null;
  private fileWatchers = new Map<string, vscode.FileSystemWatcher>();
  private trackedFiles = new Map<string, TrackedFileEntry>();
  private recentlyEditedByAIS = new Set<string>();
  private staleFiles = new Set<string>();

  static getInstance(): FileContextTracker {
    if (!FileContextTracker._instance) {
      FileContextTracker._instance = new FileContextTracker();
    }
    return FileContextTracker._instance;
  }

  private shouldTrack(): boolean {
    const config = vscode.workspace.getConfiguration('aisCode');
    return config.get<boolean>('context.trackFiles') ?? true;
  }

  async trackRead(filePath: string) {
    if (!this.shouldTrack()) return;
    const resolved = resolveWorkspacePath(filePath);
    if (resolved.error || !resolved.resolvedPath) return;

    const absolutePath = resolved.resolvedPath;
    const relativePath = vscode.workspace.asRelativePath(absolutePath);

    const mtime = await this.getFileMtime(absolutePath);
    this.trackedFiles.set(absolutePath, {
      absolutePath,
      relativePath,
      lastReadAt: Date.now(),
      lastKnownMtime: mtime ?? undefined
    });

    await this.ensureWatcher(absolutePath);
  }

  async trackEdit(filePath: string) {
    if (!this.shouldTrack()) return;
    const resolved = resolveWorkspacePath(filePath);
    if (resolved.error || !resolved.resolvedPath) return;

    const absolutePath = resolved.resolvedPath;
    const relativePath = vscode.workspace.asRelativePath(absolutePath);
    this.recentlyEditedByAIS.add(absolutePath);

    const mtime = await this.getFileMtime(absolutePath);
    this.trackedFiles.set(absolutePath, {
      absolutePath,
      relativePath,
      lastReadAt: Date.now(),
      lastKnownMtime: mtime ?? undefined
    });

    this.staleFiles.delete(absolutePath);
    await this.ensureWatcher(absolutePath);
  }

  getAndClearStaleFiles(): string[] {
    if (!this.shouldTrack()) return [];
    const files = Array.from(this.staleFiles).map((abs) => {
      const entry = this.trackedFiles.get(abs);
      return entry?.relativePath || abs;
    });
    this.staleFiles.clear();
    return files;
  }

  private async ensureWatcher(absolutePath: string) {
    if (this.fileWatchers.has(absolutePath)) return;

    const dir = path.dirname(absolutePath);
    const base = path.basename(absolutePath);
    const pattern = new vscode.RelativePattern(dir, base);

    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidChange(async () => {
      if (this.recentlyEditedByAIS.has(absolutePath)) {
        this.recentlyEditedByAIS.delete(absolutePath);
        const mtime = await this.getFileMtime(absolutePath);
        const tracked = this.trackedFiles.get(absolutePath);
        if (tracked) {
          tracked.lastKnownMtime = mtime ?? tracked.lastKnownMtime;
        }
        return;
      }

      this.staleFiles.add(absolutePath);
      const mtime = await this.getFileMtime(absolutePath);
      const tracked = this.trackedFiles.get(absolutePath);
      if (tracked) {
        tracked.lastKnownMtime = mtime ?? tracked.lastKnownMtime;
      }
    });

    watcher.onDidDelete(() => {
      this.staleFiles.delete(absolutePath);
      this.trackedFiles.delete(absolutePath);
      this.disposeWatcher(absolutePath);
    });

    this.fileWatchers.set(absolutePath, watcher);
  }

  private disposeWatcher(absolutePath: string) {
    const watcher = this.fileWatchers.get(absolutePath);
    if (watcher) {
      watcher.dispose();
      this.fileWatchers.delete(absolutePath);
    }
  }

  private async getFileMtime(absolutePath: string): Promise<number | null> {
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(absolutePath));
      return stat.mtime;
    } catch {
      return null;
    }
  }

  dispose(): void {
    for (const watcher of this.fileWatchers.values()) {
      watcher.dispose();
    }
    this.fileWatchers.clear();
    this.trackedFiles.clear();
    this.staleFiles.clear();
    this.recentlyEditedByAIS.clear();
  }
}
