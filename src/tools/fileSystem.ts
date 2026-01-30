import * as vscode from 'vscode';

export class FileSystemTools {
  static async readFile(path: string): Promise<string> {
    try {
      const uri = vscode.Uri.file(path);
      const content = await vscode.workspace.fs.readFile(uri);
      return new TextDecoder().decode(content);
    } catch (error) {
      throw new Error(`Failed to read file ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static async writeFile(path: string, content: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(path);
      const data = new TextEncoder().encode(content);
      await vscode.workspace.fs.writeFile(uri, data);
    } catch (error) {
      throw new Error(`Failed to write file ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static async listFiles(path: string): Promise<string[]> {
    try {
      const uri = vscode.Uri.file(path);
      const entries = await vscode.workspace.fs.readDirectory(uri);
      return entries.map(([name, type]) => {
        const typeStr = type === vscode.FileType.Directory ? '/' : '';
        return `${name}${typeStr}`;
      });
    } catch (error) {
      throw new Error(`Failed to list directory ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static async fileExists(path: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(path);
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }
}
