import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';
import * as path from 'path';
import { Tool } from '../registry';

const exec = util.promisify(cp.exec);

export class SearchFilesTool implements Tool {
  name = 'search_files';
  description = 'Searches for text patterns in the codebase. Uses git grep if available, falling back to basic traversal. Args: { query: string }';

  async execute(args: { query: string }): Promise<string> {
    const query = args.query;
    if (!query) return 'Error: No query provided.';

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return 'Error: No workspace open.';
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const results: string[] = [];

    // Strategy 1: Git Grep (Fastest, respects .gitignore)
    try {
        const { stdout } = await exec(`git grep -I -n "${query}"`, { cwd: rootPath, maxBuffer: 1024 * 1024 * 2 });
        // Format: file:line:content
        const lines = stdout.split('\n').filter(Boolean).slice(0, 50); // Limit results
        
        if (lines.length > 0) {
            return `Found matches (Git Grep):\n${lines.join('\n')}${lines.length >= 50 ? '\n...(truncated)' : ''}`;
        }
    } catch (e) {
        // Git grep failed (not a repo, or no matches, or error)
        // Check if it was "no matches" (code 1) or "error"
        // If simply no matches, we might fallback just in case or return empty.
        // But usually git grep is reliable for the repo.
    }

    // Strategy 2: VS Code FindFiles + Content Check (Slower, but works without git)
    // We limit to first 200 files to avoid hanging
    try {
        const uris = await vscode.workspace.findFiles('**/*', '**/node_modules/**', 200); 
        let matchCount = 0;
        
        for (const uri of uris) {
            if (matchCount >= 20) break; // Hard limit for fallback

            try {
                const doc = await vscode.workspace.fs.readFile(uri);
                const content = new TextDecoder().decode(doc);
                const lines = content.split('\n');
                
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes(query)) {
                        const relativePath = vscode.workspace.asRelativePath(uri);
                        results.push(`${relativePath}:${i + 1}:${lines[i].trim()}`);
                        matchCount++;
                        if (matchCount >= 50) break;
                    }
                }
            } catch (err) {
                // Ignore read errors
            }
        }
    } catch (err) {
        return `Error searching files: ${err}`;
    }

    if (results.length === 0) {
        return 'No matches found.';
    }

    return `Found matches (Manual Search):\n${results.join('\n')}`;
  }
}
