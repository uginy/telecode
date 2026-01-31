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

export class ReplaceInFileTool implements Tool {
  name = 'replace_in_file';
  description = 'Replaces specific code blocks in a file. Format content as <search>OLD</search><replace>NEW</replace>.';

  async execute(args: { path: string, content: string }): Promise<string> {
    const uri = vscode.Uri.file(args.path);
    const fileBytes = await vscode.workspace.fs.readFile(uri);
    let originalContent = new TextDecoder().decode(fileBytes);
    let newContent = originalContent;

    const regex = /<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)<\/replace>/g;
    let match;
    let replacements = 0;

    while ((match = regex.exec(args.content)) !== null) {
      const searchBlock = match[1].trim(); 
      const replaceBlock = match[2].trim(); 

      // We normalize line endings and trim for broader matching, 
      // but exact match is preferred for safety. 
      // Let's try exact first, then trimmed.
      
      if (originalContent.includes(searchBlock)) {
          // Check for multiple occurrences
          const firstIndex = originalContent.indexOf(searchBlock);
          const secondIndex = originalContent.indexOf(searchBlock, firstIndex + 1);
          if (secondIndex !== -1) {
              throw new Error(`Ambiguous match: '<search>' block found multiple times in ${args.path}. Provide more context.`);
          }
          newContent = newContent.replace(searchBlock, replaceBlock);
          replacements++;
      } else {
           // Fallback: Try to match line-by-line ignoring whitespace differences? 
           // For now, strict. Fail.
           throw new Error(`Search block not found in ${args.path}. Ensure exact match.`);
      }
    }

    if (replacements === 0) {
        return "No replacements made. Ensure format is <search>...</search><replace>...</replace>.";
    }

    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(newContent));
    return `Successfully made ${replacements} replacement(s) in ${args.path}`;
  }
}
