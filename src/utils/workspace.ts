
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

  const rootPath = workspaceFolders[0].uri.fsPath;
  const summary = [`Root: ${rootPath}`];

  try {
    // specific excludes to keep context clean
    const exclude = '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/.DS_Store}';
    const files = await vscode.workspace.findFiles('**/*', exclude, 500);

    const fileList = files.map(file => {
      return path.relative(rootPath, file.fsPath);
    });

    // Sort to make structure clear
    fileList.sort();

    summary.push("File Structure:");
    fileList.forEach(f => summary.push(`- ${f}`));

    return summary.join('\n');
  } catch (error) {
    console.error("Error generating workspace summary:", error);
    return `Error reading workspace: ${error}`;
  }
}
