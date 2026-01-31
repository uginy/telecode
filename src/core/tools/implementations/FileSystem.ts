import * as vscode from 'vscode';
import * as path from 'node:path';
import { Tool } from '../registry';
import { EditManager } from '../../edits/EditManager';

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
    const editId = EditManager.getInstance().addPendingEdit(args.path, args.content, 'Overwrite file');
    const autoApprove = vscode.workspace.getConfiguration('aisCode').get<boolean>('autoApprove') ?? true;
    
    if (autoApprove) {
        await EditManager.getInstance().applyEdit(editId);
        return `Successfully wrote file ${path.basename(args.path)} (Auto-approved).`;
    }
    
    return `[APPROVAL REQUIRED] New file content proposed for ${path.basename(args.path)} (ID: ${editId}). User must approve changes in the UI.`;
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
    if (!args.path) {
        return "Error: Path attribute is missing in <replace_in_file>. Use <replace_in_file path=\"...\">";
    }
    let targetPath = args.path;
    if (!path.isAbsolute(targetPath) && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        targetPath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, targetPath);
    }
    
    const uri = vscode.Uri.file(targetPath);
    let fileBytes: Uint8Array;
    try {
        fileBytes = await vscode.workspace.fs.readFile(uri);
    } catch (e) {
        return `Error reading file ${targetPath}: ${e}`;
    }

    let originalContent = new TextDecoder().decode(fileBytes);
    let newContent = originalContent;

    const regex = /<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)<\/replace>/g;
    let replacements = 0;

    let rMatch = regex.exec(args.content);
    while (rMatch !== null) {
      const searchBlock = rMatch[1]; 
      const replaceBlock = rMatch[2]; 
      
      // 1. Try exact match (Fast)
      if (originalContent.includes(searchBlock)) {
          // Check for uniqueness
          const firstIndex = originalContent.indexOf(searchBlock);
          if (originalContent.indexOf(searchBlock, firstIndex + 1) !== -1) {
              throw new Error(`Ambiguous match: '<search>' block found multiple times in ${args.path}. Provide more context.`);
          }
          newContent = newContent.replace(searchBlock, replaceBlock);
          replacements++;
      } else {
          // 2. Try Flexible Match (Ignore Whitespace/Indentation)
          const matchedText = this.findFlexibleMatch(originalContent, searchBlock);
          
          if (matchedText) {
             // Verify uniqueness of the flexible match
             const firstIndex = originalContent.indexOf(matchedText);
             if (originalContent.indexOf(matchedText, firstIndex + 1) !== -1) {
                 throw new Error(`Ambiguous flexible match: The code block was found multiple times. Provide more context.`);
             }
             newContent = newContent.replace(matchedText, replaceBlock);
             replacements++;
          } else {
              throw new Error(`Search block not found in ${args.path}. \nNote: Exact match failed, and flexible match (ignoring indentation) also failed. Check if the code exists.`);
          }
      }
      rMatch = regex.exec(args.content);
    }

    if (replacements === 0) {
        return "No replacements made. Ensure format is <search>...</search><replace>...</replace>.";
    }

    const editId = EditManager.getInstance().addPendingEdit(targetPath, newContent, `Replace ${replacements} block(s)`);
    const autoApprove = vscode.workspace.getConfiguration('aisCode').get<boolean>('autoApprove') ?? true;
    
    if (autoApprove) {
        await EditManager.getInstance().applyEdit(editId);
        return `Successfully replaced ${replacements} block(s) in ${path.basename(targetPath)} (Auto-approved).`;
    }
    
    return `[APPROVAL REQUIRED] Edit proposed for ${path.basename(targetPath)} (ID: ${editId}). User must approve changes in the UI.`;
  }

  private findFlexibleMatch(fileContent: string, searchBlock: string): string | null {
      const searchLines = searchBlock.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      const fileLines = fileContent.split(/\r?\n/);
      
      if (searchLines.length === 0) return null;

      const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = searchLines.map(escapeRegExp).join('\\s*\\r?\\n\\s*');
      
      for (let i = 0; i <= fileLines.length - searchLines.length; i++) {
          let isMatch = true;
          for (let j = 0; j < searchLines.length; j++) {
              if (fileLines[i + j].trim() !== searchLines[j]) {
                  isMatch = false;
                  break;
              }
          }
          
          if (isMatch) {
              // We found the approximate line range [i, i + searchLines.length - 1]
              // Use regex to find the exact substring near this position
              const fuzzyRegex = new RegExp(pattern, 'g');
              let match = fuzzyRegex.exec(fileContent);
              while (match !== null) {
                  const matchIndex = match.index;
                  const textBefore = fileContent.substring(0, matchIndex);
                  const lineCountBefore = textBefore.split(/\r?\n/).length - 1;
                  
                  // If the match starts reasonably close to line i, we found our exact block
                  if (Math.abs(lineCountBefore - i) <= 2) {
                      return match[0];
                  }
                  match = fuzzyRegex.exec(fileContent);
              }
          }
      }
      return null;
  }
}
