import * as cp from 'child_process';
import * as util from 'util';
import { Tool } from '../registry';
import { getWorkspaceRoot } from '../../../utils/workspace';
import { TerminalHistory } from '../TerminalHistory';

const exec = util.promisify(cp.exec);

export class RunCommandTool implements Tool {
  name = 'run_command';
  description = 'Executes a shell command. Use this for running tests, listing files, or system diagnostics. Args: { command: string }';

  async execute(args: { command: string }): Promise<string> {
    const command = args.command;
    if (!command) return 'Error: No command provided.';

    // Safety checks (rudimentary)
    const normalized = command.trim().toLowerCase();
    if (
      normalized.startsWith('rm -rf /') ||
      normalized.includes('> /dev/sda') ||
      /rm\s+-rf\b/.test(normalized) ||
      /mkfs\./.test(normalized) ||
      /dd\s+if=\/dev\//.test(normalized)
    ) {
        return 'Error: Command blocked for safety reasons.';
    }

    const rootPath = getWorkspaceRoot();
    if (!rootPath) {
      return 'Error: No workspace open.';
    }

    try {
        const { stdout, stderr } = await exec(command, { 
            timeout: 30000, // 30 seconds timeout
            maxBuffer: 1024 * 1024, // 1MB buffer
            cwd: rootPath
        });

        let output = '';
        if (stdout) output += `[STDOUT]\n${stdout}\n`;
        if (stderr) output += `[STDERR]\n${stderr}\n`;

        if (!output) output = 'Command executed successfully (no output).';
        
        const trimmed = output.trim();
        TerminalHistory.add(command, trimmed);
        return trimmed;
    } catch (error: any) {
        // Return error as output so the agent can see it and fix it
        let errorMessage = `Error executing command: ${error.message}`;
        if (error.stdout) errorMessage += `\n[STDOUT]\n${error.stdout}`;
        if (error.stderr) errorMessage += `\n[STDERR]\n${error.stderr}`;
        TerminalHistory.add(command, errorMessage);
        return errorMessage;
    }
  }
}
