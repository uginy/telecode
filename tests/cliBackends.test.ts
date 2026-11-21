import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  antigravityBackend,
  claudeCodeBackend,
  cliEffort,
  codexBackend,
  type CliBackend,
  type CliParseState,
} from '../src/engine/cliBackends';
import { parseAntigravityModels, parseCodexModelsCache } from '../src/engine/cliModels';
import { CliRuntime } from '../src/engine/cliRuntime';
import type { RuntimeEvent } from '../src/engine/types';

/** Feeds JSON lines (shortened from real CLI output) through a backend parser. */
function parse(backend: CliBackend, lines: object[]): { events: RuntimeEvent[]; state: CliParseState } {
  const state: CliParseState = { toolNames: new Map() };
  const events = lines.flatMap((line) => backend.parseLine(line as Record<string, unknown>, state));
  return { events, state };
}

const options = { prompt: 'fix it', model: 'default', thinkingLevel: 'high', safeMode: 'balanced' as const };

describe('Claude Code adapter', () => {
  it('builds a headless command that keeps the CLI default model', () => {
    expect(claudeCodeBackend.buildArgs(options)).toEqual([
      '-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'auto', '--effort', 'high', '--', 'fix it',
    ]);
    expect(claudeCodeBackend.buildArgs({ ...options, model: 'opus', safeMode: 'strict', thinkingLevel: 'off', sessionId: 's1' }))
      .toEqual(['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'plan', '--model', 'opus', '--resume', 's1', '--', 'fix it']);
  });

  it('turns tool calls, results and the final result into runtime events', () => {
    const { events, state } = parse(claudeCodeBackend, [
      { type: 'system', subtype: 'init', session_id: 'abc', model: 'claude-haiku-5-5' },
      { type: 'assistant', message: { content: [{ type: 'thinking', thinking: '' }] }, session_id: 'abc' },
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'cat note.txt' } }] } },
      { type: 'user', message: { content: [{ tool_use_id: 't1', type: 'tool_result', content: 'hello', is_error: false }] } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } },
      { type: 'result', subtype: 'success', is_error: false, result: 'hello', session_id: 'abc' },
    ]);
    expect(events.filter((event) => event.type !== 'status')).toEqual([
      { type: 'tool_start', toolName: 'Bash', args: { command: 'cat note.txt' } },
      { type: 'tool_end', toolName: 'Bash', isError: false, result: { content: [{ type: 'text', text: 'hello' }] } },
      { type: 'text_delta', delta: 'hello' },
    ]);
    expect(state).toMatchObject({ sessionId: 'abc', finished: true });
    expect(state.error).toBeUndefined();
  });

  it('reports a failed result', () => {
    const { state } = parse(claudeCodeBackend, [{ type: 'result', subtype: 'error_max_turns', is_error: true, result: '' }]);
    expect(state.error).toBe('Claude Code stopped: error_max_turns');
  });
});

describe('Codex adapter', () => {
  it('passes the sandbox through config so resume accepts it', () => {
    expect(codexBackend.buildArgs({ ...options, sessionId: 'th1' })).toEqual([
      'exec', 'resume', '--json', '--skip-git-repo-check', '-c', 'sandbox_mode="workspace-write"',
      '-c', 'model_reasoning_effort="high"', '--', 'th1', 'fix it',
    ]);
    expect(codexBackend.buildArgs({ ...options, safeMode: 'power', model: 'gpt-6.2-sol' })).toEqual([
      'exec', '--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox',
      '-m', 'gpt-6.2-sol', '-c', 'model_reasoning_effort="high"', '--', 'fix it',
    ]);
  });

  it('maps command items and treats warning items as status', () => {
    const { events, state } = parse(codexBackend, [
      { type: 'thread.started', thread_id: 'th1' },
      { type: 'item.completed', item: { id: 'item_0', type: 'error', message: 'Under-development features enabled' } },
      { type: 'turn.started' },
      { type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text: 'Reading note.txt.' } },
      { type: 'item.started', item: { id: 'item_2', type: 'command_execution', command: 'cat note.txt', status: 'in_progress' } },
      { type: 'item.completed', item: { id: 'item_2', type: 'command_execution', command: 'cat note.txt', aggregated_output: 'hello\n', exit_code: 0, status: 'completed' } },
      { type: 'item.completed', item: { id: 'item_3', type: 'agent_message', text: 'hello' } },
      { type: 'turn.completed', usage: {} },
    ]);
    expect(events.filter((event) => event.type !== 'status')).toEqual([
      { type: 'text_delta', delta: 'Reading note.txt.' },
      { type: 'tool_start', toolName: 'bash', args: { command: 'cat note.txt' } },
      { type: 'tool_end', toolName: 'bash', isError: false, result: { content: [{ type: 'text', text: 'hello\n' }] } },
      { type: 'text_delta', delta: '\n\nhello' },
    ]);
    expect(state).toMatchObject({ sessionId: 'th1', finished: true });
    expect(state.error).toBeUndefined();
  });

  it('fails on turn.failed', () => {
    expect(parse(codexBackend, [{ type: 'turn.failed', error: { message: 'usage limit reached' } }]).state.error).toBe('usage limit reached');
  });
});

describe('Antigravity adapter', () => {
  it('builds a headless command and resumes the conversation', () => {
    expect(antigravityBackend.buildArgs({ ...options, safeMode: 'power', sessionId: 'c1' })).toEqual([
      '-p', 'fix it', '--output-format', 'stream-json', '--dangerously-skip-permissions', '--effort', 'high', '--conversation', 'c1',
    ]);
  });

  it('maps tool steps and streamed text', () => {
    const { events, state } = parse(antigravityBackend, [
      { event: 'init', conversation_id: 'c1' },
      { event: 'step_update', step_update: { step_index: 3, state: 'ACTIVE', step_type: 'tool', tool_name: 'run_command', tool_info: { parameters: { CommandLine: 'cat note.txt' } } } },
      { event: 'step_update', step_update: { step_index: 3, state: 'DONE', step_type: 'tool', tool_name: 'run_command', tool_info: { parameters: { CommandLine: 'cat note.txt' }, output: 'hello' } } },
      { event: 'step_update', step_update: { step_index: 4, state: 'ACTIVE', step_type: 'agent_response', text_delta: 'hello' } },
      { event: 'result', result: { conversation_id: 'c1', status: 'SUCCESS', response: 'hello\n' } },
    ]);
    expect(events.filter((event) => event.type !== 'status')).toEqual([
      { type: 'tool_start', toolName: 'run_command', args: { CommandLine: 'cat note.txt' } },
      { type: 'tool_end', toolName: 'run_command', isError: false, result: { content: [{ type: 'text', text: 'hello' }] } },
      { type: 'text_delta', delta: 'hello' },
    ]);
    expect(state).toMatchObject({ sessionId: 'c1', finished: true });
  });
});

describe('CLI model lists', () => {
  it('maps TeleCode levels onto CLI effort levels', () => {
    expect(cliEffort('off', ['low', 'high'])).toBeUndefined();
    expect(cliEffort('minimal', ['low', 'high'])).toBe('low');
    expect(cliEffort('max', ['low', 'high'])).toBe('high');
  });

  it('reads listed Codex models with their efforts', () => {
    const raw = JSON.stringify({ models: [
      { slug: 'gpt-6.2-sol', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'max' }, { effort: 'ultra' }] },
      { slug: 'codex-auto-review', visibility: 'hide', supported_reasoning_levels: [] },
    ] });
    expect(parseCodexModelsCache(raw)).toEqual([{ id: 'gpt-6.2-sol', free: false, thinking: ['off', 'low', 'max'] }]);
  });

  it('reads agy models output', () => {
    const stdout = 'Fetching available models...\ngemini-3.8-flash-high\tGemini 3.8 Flash (High)\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\n';
    expect(parseAntigravityModels(stdout, ['low']).map((model) => model.id)).toEqual(['gemini-3.8-flash-high', 'claude-sonnet-4-6']);
  });
});

describe('CliRuntime', () => {
  /** A stand-in CLI that prints the given lines (one JSON event each) and exits with `code`. */
  function fakeCli(lines: object[], code = 0): CliBackend {
    const dir = mkdtempSync(join(tmpdir(), 'telecode-cli-'));
    const script = join(dir, 'fake-cli');
    writeFileSync(script, `#!/usr/bin/env node\n${lines.map((line) => `console.log(${JSON.stringify(JSON.stringify(line))});`).join('\n')}\nconsole.error('boom');\nprocess.exit(${code});\n`);
    chmodSync(script, 0o755);
    return { ...claudeCodeBackend, command: script };
  }
  const config = { provider: 'claude-code', model: 'default', apiKey: '', maxSteps: 1, allowedTools: [], cwd: tmpdir() };

  it('streams events and finishes with done', async () => {
    const runtime = new CliRuntime(config, fakeCli([
      { type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } },
      { type: 'result', subtype: 'success', is_error: false, session_id: 's1' },
    ]));
    const events: RuntimeEvent[] = [];
    runtime.onEvent((event) => events.push(event));
    await runtime.prompt('hello');
    expect(events.filter((event) => event.type !== 'status')).toEqual([{ type: 'text_delta', delta: 'hi' }, { type: 'done' }]);
  });

  it('rejects with stderr when the CLI exits without a result', async () => {
    const runtime = new CliRuntime(config, fakeCli([], 2));
    await expect(runtime.prompt('hello')).rejects.toThrow(/exited with code 2: boom/);
  });

  it('explains a missing CLI', async () => {
    const runtime = new CliRuntime(config, { ...claudeCodeBackend, command: '/nonexistent/claude' });
    await expect(runtime.prompt('hello')).rejects.toThrow('was not found');
  });
});
