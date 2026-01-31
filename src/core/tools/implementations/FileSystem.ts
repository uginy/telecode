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
    let match;
    let replacements = 0;

    // Normalize function for robust matching (ignore CR/LF differences)
    const normalize = (str: string) => str.replace(/\r\n/g, '\n');

    while ((match = regex.exec(args.content)) !== null) {
      let searchBlock = match[1]; 
      const replaceBlock = match[2]; 
      
      // 1. Try exact match
      if (originalContent.includes(searchBlock)) {
          // Check for multiple occurrences
          const firstIndex = originalContent.indexOf(searchBlock);
          const secondIndex = originalContent.indexOf(searchBlock, firstIndex + 1);
          if (secondIndex !== -1) {
              throw new Error(`Ambiguous match: '<search>' block found multiple times in ${args.path}. Provide more unique context.`);
          }
          newContent = newContent.replace(searchBlock, replaceBlock);
          replacements++;
      } else {
          // 2. Try normalized match (trim and CRLF)
          const searchBlockTrimmed = searchBlock.trim();
          const originalNormalized = normalize(originalContent);
          const searchNormalized = normalize(searchBlockTrimmed);
          
          if (originalNormalized.includes(searchNormalized)) {
              // Found it with normalization! Now we need to replace in the ORIGINAL string.
              // This is tricky. For now, let's just error but give a hint that it exists.
              // Or better: Replace blindly if unique? No, risky. 
              // Let's just try to be more flexible with trim.
               if (originalContent.includes(searchBlockTrimmed)) {
                   newContent = newContent.replace(searchBlockTrimmed, replaceBlock.trim()); // Trim replace too if we trim search? Maybe.
                   replacements++;
               } else {
                   throw new Error(`Search block not found in ${args.path}. \nNote: Identical text was not found. Check whitespace/indentation.`);
               }
          } else {
               throw new Error(`Search block not found in ${args.path}. Ensure the code inside <search>...</search> matches the file EXACTLY.`);
          }
      }
    }

    if (replacements === 0) {
        return "No replacements made. Ensure format is <search>...</search><replace>...</replace>.";
    }

    // NEW FLOW: Create Pending Edit instead of writing directly
    const editId = EditManager.getInstance().addPendingEdit(targetPath, newContent, `Replace ${replacements} block(s)`);
    
    // Notify the Agent (and via side-channel the UI)
    return `[APPROVAL REQUIRED] Edit proposed for ${path.basename(targetPath)} (ID: ${editId}). User must approve changes in the UI.`;
  }
}
