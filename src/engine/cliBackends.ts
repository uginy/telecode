/**
 * Adapters for coding-agent CLIs that run on the user's own subscription login
 * (Claude Code, Codex, Antigravity). Each adapter builds the headless command line
 * and turns one JSON line of the CLI's event stream into TeleCode runtime events.
 */

import type { RuntimeEvent } from './types';

export type SafeMode = 'strict' | 'balanced' | 'power';

export interface CliRunOptions {
  prompt: string;
  /** "default" or empty leaves the CLI's own model choice. */
  model: string;
  /** TeleCode thinking level; "off" leaves the CLI default. */
  thinkingLevel: string;
  safeMode: SafeMode;
  /** Session to continue, from a previous run of the same runtime. */
  sessionId?: string;
}

/** State one run keeps while parsing its stream. */
export interface CliParseState {
  sessionId?: string;
  /** Set when the CLI reported the final result of the turn. */
  finished?: boolean;
  /** Set when that result was a failure. */
  error?: string;
  hadText?: boolean;
  /** Tool names by call id, for CLIs that report results by id only. */
  toolNames: Map<string, string>;
}

export interface CliBackend {
  /** Executable name looked up on PATH. */
  command: string;
  /** Reasoning levels the CLI's effort flag accepts. */
  levels: string[];
  buildArgs(options: CliRunOptions): string[];
  parseLine(event: Record<string, unknown>, state: CliParseState): RuntimeEvent[];
}

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (value && typeof value === 'object' ? (value as Json) : {});
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const toolResult = (text: string) => ({ content: [{ type: 'text', text }] });

/** CLIs have no "off"/"minimal"; map TeleCode levels onto their effort scale. */
export function cliEffort(level: string, levels: readonly string[]): string | undefined {
  if (level === 'off') return undefined;
  const wanted = level === 'minimal' ? 'low' : level;
  return levels.includes(wanted) ? wanted : levels.at(-1);
}

const useModel = (model: string) => model.trim() !== '' && model.trim() !== 'default';

function textEvent(text: string, state: CliParseState): RuntimeEvent[] {
  if (!text) return [];
  // Separate consecutive assistant messages the way a streamed reply would read.
  const delta = state.hadText ? `\n\n${text}` : text;
  state.hadText = true;
  return [{ type: 'text_delta', delta }];
}

export const claudeCodeBackend: CliBackend = {
  command: 'claude',
  levels: ['low', 'medium', 'high', 'xhigh', 'max'],
  buildArgs(options) {
    const mode = { strict: 'plan', balanced: 'auto', power: 'bypassPermissions' }[options.safeMode];
    const effort = cliEffort(options.thinkingLevel, this.levels);
    return [
      '-p',
      '--output-format', 'stream-json', '--verbose',
      '--permission-mode', mode,
      ...(useModel(options.model) ? ['--model', options.model.trim()] : []),
      ...(effort ? ['--effort', effort] : []),
      ...(options.sessionId ? ['--resume', options.sessionId] : []),
      // A task often starts with "- " (a list); without "--" it would be read as a flag.
      '--', options.prompt,
    ];
  },
  parseLine(event, state) {
    const sessionId = str(event.session_id);
    if (sessionId) state.sessionId = sessionId;
    if (event.type === 'system' && event.subtype === 'init') {
      return [{ type: 'status', message: `cli_session claude model=${str(event.model) || 'default'}` }];
    }
    if (event.type === 'assistant') {
      const events: RuntimeEvent[] = [];
      for (const block of (obj(event.message).content as Json[] | undefined) ?? []) {
        if (block.type === 'text') events.push(...textEvent(str(block.text), state));
        if (block.type === 'tool_use') {
          state.toolNames.set(str(block.id), str(block.name));
          events.push({ type: 'tool_start', toolName: str(block.name), args: block.input });
        }
      }
      return events;
    }
    if (event.type === 'user') {
      const events: RuntimeEvent[] = [];
      for (const block of (obj(event.message).content as Json[] | undefined) ?? []) {
        if (block.type !== 'tool_result') continue;
        const content = Array.isArray(block.content)
          ? (block.content as Json[]).map((part) => str(part.text)).join('\n')
          : str(block.content);
        events.push({
          type: 'tool_end',
          toolName: state.toolNames.get(str(block.tool_use_id)) ?? 'tool',
          isError: block.is_error === true,
          result: toolResult(content),
        });
      }
      return events;
    }
    if (event.type === 'result') {
      state.finished = true;
      if (event.is_error === true || event.subtype !== 'success') {
        state.error = str(event.result) || `Claude Code stopped: ${str(event.subtype) || 'error'}`;
      }
      return [];
    }
    return [];
  },
};

export const codexBackend: CliBackend = {
  command: 'codex',
  levels: ['low', 'medium', 'high', 'xhigh', 'max'],
  buildArgs(options) {
    // `exec resume` has no -s flag, so the sandbox goes through config for both forms.
    const sandbox = {
      strict: ['-c', 'sandbox_mode="read-only"'],
      balanced: ['-c', 'sandbox_mode="workspace-write"'],
      power: ['--dangerously-bypass-approvals-and-sandbox'],
    }[options.safeMode];
    const effort = cliEffort(options.thinkingLevel, this.levels);
    const flags = [
      '--json', '--skip-git-repo-check', ...sandbox,
      ...(useModel(options.model) ? ['-m', options.model.trim()] : []),
      ...(effort ? ['-c', `model_reasoning_effort="${effort}"`] : []),
    ];
    // "--" keeps a prompt that starts with "-" from being parsed as a flag.
    return options.sessionId
      ? ['exec', 'resume', ...flags, '--', options.sessionId, options.prompt]
      : ['exec', ...flags, '--', options.prompt];
  },
  parseLine(event, state) {
    if (event.type === 'thread.started') {
      state.sessionId = str(event.thread_id) || state.sessionId;
      return [{ type: 'status', message: 'cli_session codex' }];
    }
    if (event.type === 'turn.completed') {
      state.finished = true;
      return [];
    }
    if (event.type === 'turn.failed' || event.type === 'error') {
      state.finished = true;
      state.error = str(obj(event.error).message) || str(event.message) || 'Codex turn failed.';
      return [];
    }
    if (event.type !== 'item.started' && event.type !== 'item.completed') return [];
    const item = obj(event.item);
    const done = event.type === 'item.completed';
    const id = str(item.id);
    switch (item.type) {
      case 'agent_message':
        return done ? textEvent(str(item.text), state) : [];
      case 'error':
        // Codex reports warnings (e.g. unstable features) as error items; the turn still runs.
        return done ? [{ type: 'status', message: `cli_warning ${str(item.message)}` }] : [];
      case 'command_execution':
      case 'file_change':
      case 'mcp_tool_call':
      case 'web_search': {
        const name = item.type === 'command_execution' ? 'bash'
          : item.type === 'file_change' ? 'edit'
          : item.type === 'web_search' ? 'web_search'
          : `${str(item.server)}.${str(item.tool)}`;
        const args = item.type === 'command_execution' ? { command: item.command }
          : item.type === 'file_change' ? { changes: item.changes }
          : item.type === 'web_search' ? { query: item.query } : item.arguments;
        const events: RuntimeEvent[] = [];
        // Some items (file changes) arrive only as completed.
        if (!state.toolNames.has(id)) {
          state.toolNames.set(id, name);
          events.push({ type: 'tool_start', toolName: name, args });
        }
        if (done) {
          const failed = item.status === 'failed' || (typeof item.exit_code === 'number' && item.exit_code !== 0);
          events.push({ type: 'tool_end', toolName: name, isError: failed, result: toolResult(str(item.aggregated_output)) });
        }
        return events;
      }
      default:
        return [];
    }
  },
};

export const antigravityBackend: CliBackend = {
  command: 'agy',
  levels: ['low', 'medium', 'high', 'xhigh', 'max'],
  buildArgs(options) {
    const mode = {
      strict: ['--mode', 'plan'],
      balanced: ['--mode', 'auto'],
      power: ['--dangerously-skip-permissions'],
    }[options.safeMode];
    const effort = cliEffort(options.thinkingLevel, this.levels);
    return [
      '-p', options.prompt, '--output-format', 'stream-json', ...mode,
      ...(useModel(options.model) ? ['--model', options.model.trim()] : []),
      ...(effort ? ['--effort', effort] : []),
      ...(options.sessionId ? ['--conversation', options.sessionId] : []),
    ];
  },
  parseLine(event, state) {
    if (event.event === 'init') {
      state.sessionId = str(event.conversation_id) || state.sessionId;
      return [{ type: 'status', message: 'cli_session antigravity' }];
    }
    if (event.event === 'result') {
      const result = obj(event.result);
      state.finished = true;
      if (result.status !== 'SUCCESS') state.error = str(result.error) || `Antigravity stopped: ${str(result.status) || 'error'}`;
      return [];
    }
    if (event.event !== 'step_update') return [];
    const step = obj(event.step_update);
    if (step.step_type === 'agent_response') {
      const delta = str(step.text_delta);
      if (!delta) return [];
      state.hadText = true;
      return [{ type: 'text_delta', delta }];
    }
    if (step.step_type !== 'tool') return [];
    const key = String(step.step_index);
    const name = str(step.tool_name) || 'tool';
    const info = obj(step.tool_info);
    const events: RuntimeEvent[] = [];
    if (!state.toolNames.has(key)) {
      state.toolNames.set(key, name);
      events.push({ type: 'tool_start', toolName: name, args: info.parameters });
    }
    if (step.state === 'DONE' || step.state === 'ERROR' || step.state === 'CANCELED') {
      events.push({ type: 'tool_end', toolName: name, isError: step.state !== 'DONE', result: toolResult(str(info.output)) });
    }
    return events;
  },
};

export const CLI_BACKENDS: Record<string, CliBackend> = {
  'claude-code': claudeCodeBackend,
  codex: codexBackend,
  antigravity: antigravityBackend,
};
