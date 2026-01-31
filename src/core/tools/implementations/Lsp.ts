import * as vscode from 'vscode';
import { Tool } from '../registry';

export class GetProblemsTool implements Tool {
  name = 'get_problems';
  description = 'Retrieves current compilation errors and warnings (diagnostics) from open files. Use this to check for syntax errors or type mismatches. Args: { path?: string } (Optional: check only specific file)';

  async execute(args: { path?: string }): Promise<string> {
    let diagnostics: [vscode.Uri, vscode.Diagnostic[]][];

    if (args.path) {
        // Specific file
        const uri = vscode.Uri.file(args.path);
        const diags = vscode.languages.getDiagnostics(uri);
        diagnostics = [[uri, diags]];
    } else {
        // All files
        diagnostics = vscode.languages.getDiagnostics();
    }

    const output: string[] = [];
    let errorCount = 0;

    for (const [uri, diags] of diagnostics) {
        if (diags.length === 0) continue;
        
        // Skip node_modules or .git
        if (uri.fsPath.includes('node_modules') || uri.fsPath.includes('.git')) continue;

        const relativePath = vscode.workspace.asRelativePath(uri);
        
        for (const diag of diags) {
            // Only show Error and Warning, skip info/hint to reduce noise
            if (diag.severity === vscode.DiagnosticSeverity.Error || diag.severity === vscode.DiagnosticSeverity.Warning) {
                const severity = diag.severity === vscode.DiagnosticSeverity.Error ? 'Error' : 'Warning';
                const line = diag.range.start.line + 1;
                const character = diag.range.start.character + 1;
                
                output.push(`[${severity}] ${relativePath}:${line}:${character} - ${diag.message}`);
                errorCount++;
            }
        }
    }

    if (errorCount === 0) {
        return 'No errors or warnings found.';
    }

    // Limit output to avoid token overflow
    if (output.length > 50) {
        return `Found ${errorCount} problems. Showing first 50:\n${output.slice(0, 50).join('\n')}\n...(truncated)`;
    }

    return `Found ${errorCount} problems:\n${output.join('\n')}`;
  }
}
