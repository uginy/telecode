import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { AgentRuntime, ImageContentExt, RuntimeConfig, RuntimeEvent, RuntimeListener } from './types';
import { type CliBackend, type CliParseState, type SafeMode } from './cliBackends';

const STDERR_TAIL_CHARS = 2_000;
let loginPath: string | undefined;
const resolvedCommands = new Map<string, string>();

/**
 * PATH of the user's login shell. VS Code started from the Dock gets a minimal PATH that
 * misses ~/.local/bin, Homebrew and nvm, where these CLIs usually live.
 */
export function getLoginShellPath(): string {
  if (loginPath !== undefined) return loginPath;
  loginPath = process.env.PATH ?? '';
  if (process.platform === 'win32') return loginPath;
  const shell = process.env.SHELL || '/bin/zsh';
  // shortcut: one interactive login shell, 8s cap; add a PATH setting if a shell hangs or prints noise there.
  const result = spawnSync(shell, ['-ilc', 'printf "__TELECODE_PATH__%s" "$PATH"'], { encoding: 'utf8', timeout: 8_000 });
  const match = /__TELECODE_PATH__(.*)$/s.exec(result.stdout ?? '');
  if (match?.[1]) loginPath = [match[1].trim(), loginPath].filter(Boolean).join(':');
  return loginPath;
}

/** Absolute path of a CLI, or undefined when it is not installed. */
export function resolveCliCommand(command: string): string | undefined {
  const cached = resolvedCommands.get(command);
  if (cached) return cached;
  if (isAbsolute(command)) return existsSync(command) ? command : undefined;
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  const dirs = [...getLoginShellPath().split(process.platform === 'win32' ? ';' : ':'), join(homedir(), '.local', 'bin')];
  for (const dir of dirs.filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(dir, command + extension);
      if (existsSync(candidate)) {
        resolvedCommands.set(command, candidate);
        return candidate;
      }
    }
  }
  return undefined;
}

export function cliNotFoundMessage(command: string): string {
  return `"${command}" CLI was not found. Install it, sign in with your subscription in a terminal, then try again.`;
}

/** One short read-only turn, to check the CLI is installed and signed in. */
export async function testCliConnection(backend: CliBackend, provider: string, model: string, cwd: string): Promise<string> {
  const runtime = new CliRuntime(
    { provider, model, apiKey: '', maxSteps: 1, allowedTools: [], cwd, safeModeProfile: 'strict' },
    backend,
  );
  const timer = setTimeout(() => runtime.abort(), 120_000);
  try {
    await runtime.prompt('Reply with OK.');
  } finally {
    clearTimeout(timer);
  }
  return `${provider}/${model || 'default'}`;
}

/** Runs each task through a locally installed coding-agent CLI on the user's own login. */
export class CliRuntime implements AgentRuntime {
  public readonly engine = 'cli' as const;

  private readonly listeners = new Set<RuntimeListener>();
  private child: ChildProcess | undefined;
  private sessionId: string | undefined;
  private aborted = false;

  constructor(
    private readonly config: RuntimeConfig,
    private readonly backend: CliBackend,
  ) {}

  async prompt(message: string, images?: ImageContentExt[]): Promise<void> {
    const command = resolveCliCommand(this.backend.command);
    if (!command) return this.fail(cliNotFoundMessage(this.backend.command));
    if (images?.length) this.emit({ type: 'status', message: 'cli_images_skipped: images are not passed to CLI agents' });

    const language = this.config.language === 'ru' ? 'Reply in Russian.\n\n' : this.config.language === 'en' ? 'Reply in English.\n\n' : '';
    const args = this.backend.buildArgs({
      prompt: language + message,
      model: this.config.model,
      thinkingLevel: this.config.thinkingLevel ?? 'off',
      safeMode: (this.config.safeModeProfile ?? 'balanced') as SafeMode,
      sessionId: this.sessionId,
    });
    this.emit({
      type: 'status',
      message: `llm_config engine=cli provider=${this.config.provider} model=${this.config.model || 'default'} thinking=${this.config.thinkingLevel ?? 'off'} session=${this.sessionId ? 'resumed' : 'new'}`,
    });

    this.aborted = false;
    const state: CliParseState = { toolNames: new Map() };
    let stderr = '';
    // A long command or a long think inside the CLI emits nothing; keep the task watchdog from
    // killing a live process. shortcut: a hung CLI then runs until stopped; add a run cap if that shows up.
    const heartbeat = setInterval(() => this.emit({ type: 'status', message: 'event:cli_heartbeat' }), 30_000);
    const exit = await new Promise<{ code: number | null; spawnError?: Error }>((resolve) => {
      const child = spawn(command, args, {
        cwd: this.config.cwd,
        env: { ...process.env, PATH: getLoginShellPath() },
        // Codex waits for stdin unless it is closed.
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.child = child;
      createInterface({ input: child.stdout! }).on('line', (line) => {
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line);
        } catch {
          if (line.trim()) this.emit({ type: 'status', message: `cli_output ${line.trim().slice(0, 200)}` });
          return;
        }
        for (const runtimeEvent of this.backend.parseLine(event, state)) this.emit(runtimeEvent);
      });
      child.stderr!.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL_CHARS);
      });
      child.on('error', (spawnError) => resolve({ code: null, spawnError }));
      child.on('close', (code) => resolve({ code }));
    });
    clearInterval(heartbeat);
    this.child = undefined;
    if (state.sessionId) this.sessionId = state.sessionId;

    if (this.aborted) return this.fail('Task interrupted.');
    if (exit.spawnError) return this.fail(`Could not start ${this.backend.command}: ${exit.spawnError.message}`);
    if (state.error) return this.fail(state.error);
    if (!state.finished && exit.code !== 0) {
      return this.fail(`${this.backend.command} exited with code ${exit.code}${stderr.trim() ? `: ${stderr.trim()}` : ''}`);
    }
    this.emit({ type: 'done' });
  }

  abort(): void {
    if (!this.child) return;
    this.aborted = true;
    const child = this.child;
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 3_000).unref();
  }

  onEvent(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getModelInfo(): { id: string; provider: string; api: string; baseUrl: string } {
    return { id: this.config.model || 'default', provider: this.config.provider, api: `cli:${this.backend.command}`, baseUrl: '(local CLI)' };
  }

  private fail(message: string): never {
    this.emit({ type: 'error', message });
    throw new Error(message);
  }

  private emit(event: RuntimeEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
