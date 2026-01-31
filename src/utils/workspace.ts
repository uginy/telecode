
import * as vscode from 'vscode';
import * as path from 'path';

export function getWorkspaceRoot(): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }
  return workspaceFolders[0].uri.fsPath;
}

export function resolveWorkspacePath(inputPath: string): { resolvedPath?: string; error?: string } {
  if (!inputPath) {
    return { error: 'Path is required.' };
  }

  const rootPath = getWorkspaceRoot();
  if (!rootPath) {
    return { error: 'No workspace folder open.' };
  }

  const normalized = path.normalize(inputPath);
  const resolvedPath = path.isAbsolute(normalized) ? normalized : path.join(rootPath, normalized);
  const relative = path.relative(rootPath, resolvedPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { error: `Path is outside the workspace: ${inputPath}` };
  }

  return { resolvedPath };
}

export async function getWorkspaceSummary(): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return "No workspace folder open.";
  }

  const rootFolder = workspaceFolders[0];
  const rootPath = rootFolder.uri.fsPath;
  const summary: string[] = [`Root: ${rootPath}`];

  try {
    const entries = await vscode.workspace.fs.readDirectory(rootFolder.uri);
    const topEntries = entries
      .filter(([name]) => !name.startsWith('.'))
      .map(([name, type]) => ({ name, type }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 40);

    summary.push('Top-level:');
    topEntries.forEach(entry => {
      summary.push(`- ${entry.type === vscode.FileType.Directory ? `${entry.name}/` : entry.name}`);
    });

    const importantDirs = new Set(['src', 'webview', 'packages', 'apps', 'lib', 'docs', 'test', 'tests']);
    for (const entry of topEntries) {
      if (entry.type !== vscode.FileType.Directory) continue;
      if (!importantDirs.has(entry.name)) continue;
      const childUri = vscode.Uri.joinPath(rootFolder.uri, entry.name);
      const children = await vscode.workspace.fs.readDirectory(childUri);
      const childNames = children
        .filter(([name]) => !name.startsWith('.'))
        .map(([name, type]) => (type === vscode.FileType.Directory ? `${name}/` : name))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 20);
      if (childNames.length > 0) {
        summary.push(`${entry.name}/: ${childNames.join(', ')}`);
      }
    }

    const readmeUris = await vscode.workspace.findFiles('{README.md,README.MD,README,readme.md,readme.MD,readme}', '**/node_modules/**', 1);
    if (readmeUris.length > 0) {
      const readme = await vscode.workspace.fs.readFile(readmeUris[0]);
      const readmeText = readme.toString().slice(0, 2000);
      summary.push('README (excerpt):');
      summary.push(readmeText);
    }

    const packageUris = await vscode.workspace.findFiles('package.json', '**/{node_modules,dist,out,build}/**', 1);
    if (packageUris.length > 0) {
      try {
        const pkgRaw = await vscode.workspace.fs.readFile(packageUris[0]);
        const pkgText = pkgRaw.toString();
        const pkg = JSON.parse(pkgText) as { name?: string; version?: string; description?: string; scripts?: Record<string, string> };
        summary.push('package.json:');
        summary.push(`- name: ${pkg.name ?? 'unknown'}`);
        if (pkg.version) summary.push(`- version: ${pkg.version}`);
        if (pkg.description) summary.push(`- description: ${pkg.description}`);
        if (pkg.scripts) {
          const scriptKeys = Object.keys(pkg.scripts).sort().slice(0, 12);
          if (scriptKeys.length > 0) {
            summary.push(`- scripts: ${scriptKeys.join(', ')}`);
          }
        }
      } catch (e) {
        summary.push(`package.json: failed to parse (${String(e)})`);
      }
    }

    return summary.join('\n');
  } catch (error) {
    console.error("Error generating workspace summary:", error);
    return `Error reading workspace: ${error}`;
  }
}
