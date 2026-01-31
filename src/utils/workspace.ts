
import * as vscode from 'vscode';
import * as path from 'path';

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
