import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { DEFAULT_BASH_TIMEOUT_MS, runShellCommand, trimOutput, resolveToolPath } from '../core/utils';

export const bashParams = Type.Object({
  command: Type.String({ description: 'Shell command to execute' }),
  cwd: Type.Optional(Type.String({ description: 'Optional absolute/relative working directory' })),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 300000, description: 'Timeout in milliseconds' })),
});

type BashParams = Static<typeof bashParams>;

export function createTerminalTools(getContext: () => { workingDirectory: string }): AgentTool[] {
  return [
    {
      name: 'bash',
      label: 'Bash',
      description: 'Execute shell commands in the workspace.',
      parameters: bashParams,
      execute: async (toolCallId, params, abortSignal) => {
        const { workingDirectory } = getContext();
        const typed = params as BashParams;
        const timeoutMs = typed.timeoutMs ?? DEFAULT_BASH_TIMEOUT_MS;
        
        // Use provided cwd or fall back to current working directory
        const execCwd = typed.cwd ? resolveToolPath(typed.cwd, workingDirectory) : workingDirectory;

        const result = await runShellCommand(typed.command, execCwd, timeoutMs, abortSignal);

        const combined = [
          result.stdout.trim(),
          result.stderr.trim(),
          result.timedOut ? `\nCommand timed out after ${timeoutMs}ms.` : '',
          result.exitCode !== 0 && result.exitCode !== null ? `\nCommand failed with exit code ${result.exitCode}` : '',
        ]
          .filter((s) => s.length > 0)
          .join('\n');

        return {
          content: [{ type: 'text', text: trimOutput(combined || '(no output)') }],
          details: {
            command: typed.command,
            cwd: execCwd,
            exitCode: result.exitCode,
            timedOut: result.timedOut,
          },
        };
      },
    },
  ];
}
