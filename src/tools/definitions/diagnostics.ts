import * as vscode from 'vscode';
import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { resolveToolPath, renderPath } from '../core/utils';

export const diagnosticsParams = Type.Object({
  path: Type.Optional(Type.String({ description: 'File path to get diagnostics for. If omitted, returns diagnostics for all open files.' })),
  severity: Type.Optional(
    Type.String({
      description: 'Minimum severity filter: error, warning, info, or hint (default: warning)',
      enum: ['error', 'warning', 'info', 'hint'],
    })
  ),
  maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 500, description: 'Max diagnostic entries (default: 50)' })),
});

type DiagnosticsParams = Static<typeof diagnosticsParams>;

const SEVERITY_MAP: Record<string, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

const SEVERITY_LABEL: Record<number, string> = {
  [vscode.DiagnosticSeverity.Error]: 'error',
  [vscode.DiagnosticSeverity.Warning]: 'warning',
  [vscode.DiagnosticSeverity.Information]: 'info',
  [vscode.DiagnosticSeverity.Hint]: 'hint',
};

interface FormattedDiagnostic {
  file: string;
  line: number;
  column: number;
  severity: string;
  message: string;
  source: string;
  code: string;
}

function formatDiagnostic(
  uri: vscode.Uri,
  diagnostic: vscode.Diagnostic,
  workingDirectory: string
): FormattedDiagnostic {
  const codeValue = diagnostic.code;
  let codeStr = '';
  if (codeValue !== undefined) {
    if (typeof codeValue === 'object' && codeValue !== null && 'value' in codeValue) {
      codeStr = String(codeValue.value);
    } else {
      codeStr = String(codeValue);
    }
  }

  return {
    file: renderPath(uri.fsPath, workingDirectory),
    line: diagnostic.range.start.line + 1,
    column: diagnostic.range.start.character + 1,
    severity: SEVERITY_LABEL[diagnostic.severity] || 'unknown',
    message: diagnostic.message,
    source: diagnostic.source || '',
    code: codeStr,
  };
}

export function createDiagnosticsTools(getContext: () => { workingDirectory: string }): AgentTool[] {
  return [
    {
      name: 'diagnostics',
      label: 'Diagnostics',
      description:
        'Get TypeScript, ESLint, and other diagnostics (errors/warnings) from VS Code. ' +
        'Faster than running tsc or eslint — reads directly from the IDE.',
      parameters: diagnosticsParams,
      execute: async (_toolCallId, params) => {
        const { workingDirectory } = getContext();
        const typed = params as DiagnosticsParams;
        const maxResults = typed.maxResults ?? 50;
        const minSeverity = SEVERITY_MAP[typed.severity || 'warning'] ?? vscode.DiagnosticSeverity.Warning;

        let allDiagnostics: [vscode.Uri, readonly vscode.Diagnostic[]][];

        if (typed.path) {
          const filePath = resolveToolPath(typed.path, workingDirectory);
          const uri = vscode.Uri.file(filePath);
          const fileDiagnostics = vscode.languages.getDiagnostics(uri);
          allDiagnostics = [[uri, fileDiagnostics]];
        } else {
          allDiagnostics = vscode.languages.getDiagnostics();
        }

        const results: FormattedDiagnostic[] = [];

        for (const [uri, diagnostics] of allDiagnostics) {
          if (results.length >= maxResults) break;

          for (const diagnostic of diagnostics) {
            if (results.length >= maxResults) break;
            if (diagnostic.severity > minSeverity) continue;

            results.push(formatDiagnostic(uri, diagnostic, workingDirectory));
          }
        }

        if (results.length === 0) {
          const scope = typed.path ? renderPath(resolveToolPath(typed.path, workingDirectory), workingDirectory) : 'workspace';
          return {
            content: [{ type: 'text', text: `No diagnostics (${typed.severity || 'warning'}+) found in ${scope}.` }],
            details: { count: 0, scope },
          };
        }

        // Format as concise multi-line output
        const lines = results.map((d) => {
          const loc = `${d.file}:${d.line}:${d.column}`;
          const src = d.source ? ` [${d.source}${d.code ? `:${d.code}` : ''}]` : '';
          return `${d.severity.toUpperCase()} ${loc}${src} ${d.message}`;
        });

        const summary = buildSummary(results);

        return {
          content: [{ type: 'text', text: `${summary}\n\n${lines.join('\n')}` }],
          details: {
            count: results.length,
            capped: results.length >= maxResults,
            ...countBySeverity(results),
          },
        };
      },
    },
  ];
}

function buildSummary(diagnostics: FormattedDiagnostic[]): string {
  const counts = countBySeverity(diagnostics);
  const parts: string[] = [];
  if (counts.errors > 0) parts.push(`${counts.errors} error${counts.errors === 1 ? '' : 's'}`);
  if (counts.warnings > 0) parts.push(`${counts.warnings} warning${counts.warnings === 1 ? '' : 's'}`);
  if (counts.infos > 0) parts.push(`${counts.infos} info`);
  if (counts.hints > 0) parts.push(`${counts.hints} hint${counts.hints === 1 ? '' : 's'}`);
  return `Found ${diagnostics.length} diagnostic${diagnostics.length === 1 ? '' : 's'}: ${parts.join(', ')}`;
}

function countBySeverity(diagnostics: FormattedDiagnostic[]): {
  errors: number;
  warnings: number;
  infos: number;
  hints: number;
} {
  let errors = 0, warnings = 0, infos = 0, hints = 0;
  for (const d of diagnostics) {
    if (d.severity === 'error') errors++;
    else if (d.severity === 'warning') warnings++;
    else if (d.severity === 'info') infos++;
    else if (d.severity === 'hint') hints++;
  }
  return { errors, warnings, infos, hints };
}
