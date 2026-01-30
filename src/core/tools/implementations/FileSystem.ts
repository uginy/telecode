import * as vscode from 'vscode';
import * as path from 'node:path';
import { Tool } from '../registry';

export class ReadFileTool implements Tool {
  name = 'read_file';
  description = 'Reads the content of a file.';

  async execute(args: { path: string }): Promise<string> {
    const uri = vscode.Uri.file(args.path);
    const content = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(content);
  }
}

export class WriteFileTool implements Tool {
  name = 'write_file';
  description = 'Writes content to a file.';

  async execute(args: { path: string, content: string }): Promise<string> {
    const uri = vscode.Uri.file(args.path);
    const data = new TextEncoder().encode(args.content);
    await vscode.workspace.fs.writeFile(uri, data);
    return `Successfully wrote to ${args.path}`;
  }
}

export class ListFilesTool implements Tool {
  name = 'list_files';
  description = 'Lists files in a directory.';

  async execute(args: { path: string }): Promise<string> {
    const uri = vscode.Uri.file(args.path);
    const entries = await vscode.workspace.fs.readDirectory(uri);
    return entries.map(([name, type]) => {
      return type === vscode.FileType.Directory ? `${name}/` : name;
    }).join('\n');
  }
}
