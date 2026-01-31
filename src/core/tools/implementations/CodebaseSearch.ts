import * as vscode from 'vscode';
import { Tool } from '../registry';
import { SemanticIndex } from '../../context/SemanticIndex';
import { resolveWorkspacePath } from '../../../utils/workspace';

export class CodebaseSearchTool implements Tool {
  name = 'codebase_search';
  description = 'Semantic search across the codebase. Args: { query: string, path?: string }';

  async execute(args: { query: string; path?: string | null }): Promise<string> {
    const query = args.query?.trim();
    if (!query) return 'Error: No query provided.';

    const config = vscode.workspace.getConfiguration('aisCode');
    const workspaceIndex = config.get<boolean>('workspaceIndex') ?? true;
    if (!workspaceIndex) {
      return 'Error: Semantic index is disabled in settings (aisCode.workspaceIndex).';
    }

    let pathPrefix: string | undefined;
    if (args.path) {
      const resolved = resolveWorkspacePath(args.path);
      if (resolved.error || !resolved.resolvedPath) {
        return `Error: ${resolved.error}`;
      }
      pathPrefix = resolved.resolvedPath;
    }

    const maxSnippets = config.get<number>('context.maxSearchSnippets') || 8;
    const results = await SemanticIndex.getInstance().search(query, maxSnippets * 2);
    if (results.length === 0) return `No semantic matches found for: "${query}"`;

    const filtered = pathPrefix
      ? results.filter(result => result.path.startsWith(pathPrefix))
      : results;

    const limited = filtered.slice(0, maxSnippets);
    if (limited.length === 0) {
      return `No semantic matches found under path: ${args.path}`;
    }

    const snippets: string[] = [];
    for (const result of limited) {
      try {
        const uri = vscode.Uri.file(result.path);
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = new TextDecoder().decode(bytes);
        const { snippet, startLine, endLine } = this.extractSnippet(text, query);
        const relativePath = vscode.workspace.asRelativePath(uri);

        snippets.push(
          `File: ${relativePath}\nScore: ${result.score.toFixed(3)}\nLines: ${startLine}-${endLine}\nSnippet:\n${snippet}`
        );
      } catch {
        // ignore read errors
      }
    }

    return `Query: ${query}\nResults:\n\n${snippets.join('\n\n')}`;
  }

  private extractSnippet(text: string, query: string) {
    const keywords = query
      .split(/\s+/)
      .map(token => token.trim())
      .filter(Boolean);

    const lines = text.split(/\r?\n/);
    let bestLine = 0;
    if (keywords.length > 0) {
      const lowerKeywords = keywords.map(k => k.toLowerCase());
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        if (lowerKeywords.some(k => line.includes(k))) {
          bestLine = i;
          break;
        }
      }
    }

    const start = Math.max(0, bestLine - 12);
    const end = Math.min(lines.length, bestLine + 12);
    const snippet = lines.slice(start, end).join('\n');

    return {
      snippet,
      startLine: start + 1,
      endLine: end
    };
  }
}
