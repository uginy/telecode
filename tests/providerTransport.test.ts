import { afterEach, describe, expect, it, vi } from 'vitest';
import { Type } from '@earendil-works/pi-ai';
import { CodingAgent, createAgent } from '../src/agent/codingAgent';

vi.mock('../src/prompts/promptStack', () => ({
  buildComposedSystemPrompt: () => ({ source: 'stack', signature: 'test', layerCount: 1, missing: [], prompt: 'Test system prompt' }),
}));

afterEach(() => vi.unstubAllGlobals());

function mockProvider(firstReply?: string) {
  const requests: Array<{ url: string; body: Record<string, unknown>; headers: Headers }> = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push({ url: request.url, body: await request.json() as Record<string, unknown>, headers: request.headers });
    return new Response((requests.length === 1 && firstReply) || providerEvents(request.url), { headers: { 'content-type': 'text/event-stream' } });
  });
  vi.stubGlobal('fetch', fetch);
  return { requests, fetch };
}

function providerEvents(url: string): string {
  const data = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
  const event = (value: { type: string; [key: string]: unknown }) => `event: ${value.type}\n${data(value)}`;
  if (url.includes('/messages')) {
    return [
      { type: 'message_start', message: { id: 'message', type: 'message', role: 'assistant', content: [], model: 'test', usage: { input_tokens: 1, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ].map(event).join('');
  }
  if (url.includes(':streamGenerateContent')) {
    return data({ candidates: [{ content: { role: 'model', parts: [{ text: 'OK' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } });
  }
  if (url.endsWith('/responses')) {
    const item = { id: 'message', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'OK', annotations: [] }] };
    return [
      { type: 'response.created', response: { id: 'response', status: 'in_progress' } },
      { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
      { type: 'response.content_part.added', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'OK' },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'response', status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
    ].map(event).join('');
  }
  return data({ id: 'response', choices: [{ index: 0, delta: { role: 'assistant', content: 'OK' }, finish_reason: null }] }) +
    data({ id: 'response', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) + 'data: [DONE]\n\n';
}

describe('native provider transport', () => {
  it.each([
    ['openrouter', 'openrouter/free'], ['openai', 'gpt-4o'], ['openai', 'gpt-5'],
    ['anthropic', 'claude-sonnet-4-6'], ['google', 'gemini-2.5-flash'],
    ['minimax', 'MiniMax-M2.7'], ['moonshot', 'kimi-k2.5'], ['ollama', 'local-test'],
  ])('checks %s/%s through its SDK without sending workspace data', async (provider, model) => {
    const { requests } = mockProvider();
    await expect(CodingAgent.testConnection({ provider, model, apiKey: provider === 'ollama' ? '' : 'test-key', baseUrl: 'http://localhost:12345/v1' })).resolves.toBe(`${provider}/${model}`);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain('http://localhost:12345/');
    expect(JSON.stringify(requests[0].body)).toContain('Reply with OK.');
    expect(requests[0].body.tools ?? []).toEqual([]);
    expect(JSON.stringify(requests[0].body)).not.toContain('Test system prompt');
  });

  it('sends the system prompt and tool declarations after resuming an older session', async () => {
    const { requests } = mockProvider();
    const agent = createAgent({ provider: 'openrouter', model: 'openrouter/free', apiKey: 'test-key', baseUrl: 'http://localhost:12345/v1', maxSteps: 2,
      initialMessages: [{ role: 'user', content: 'Previous task', timestamp: 0 }] },
    [{ name: 'inspect', label: 'Inspect', description: 'Inspect workspace', parameters: Type.Object({}), execute: vi.fn() }]);
    await agent.prompt('New task');
    expect(requests[0].body.tools).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'function', function: expect.objectContaining({ name: 'inspect' }) })]));
    expect(JSON.stringify(requests[0].body.messages)).toContain('Test system prompt');
    expect(JSON.stringify(requests[0].body.messages)).toContain('Previous task');
  });

  it.each([['openrouter', 'openrouter/free'], ['moonshot', 'kimi-k2.5'], ['deepseek', 'deepseek-chat']])('preserves tool call IDs through the %s adapter', async (provider, model) => {
    const toolReply = 'data: ' + JSON.stringify({ id: 'response', choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_test', type: 'function', function: { name: 'inspect', arguments: '{"path":"README.md"}' } }] }, finish_reason: null }] }) + '\n\n' +
      'data: ' + JSON.stringify({ id: 'response', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }) + '\n\ndata: [DONE]\n\n';
    const { requests } = mockProvider(toolReply);
    const execute = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'file contents' }], details: {} }));
    const agent = createAgent({ provider, model, apiKey: 'test-key', baseUrl: 'http://localhost:12345/v1', maxSteps: 2 },
      [{ name: 'inspect', label: 'Inspect', description: 'Inspect file', parameters: Type.Object({ path: Type.String() }), execute }]);
    await agent.prompt('Inspect README.md');
    expect(execute).toHaveBeenCalledOnce();
    expect(requests).toHaveLength(2);
    const messages = requests[1].body.messages as Array<Record<string, unknown>>;
    const assistant = messages.find((message) => Array.isArray(message.tool_calls));
    const result = messages.find((message) => message.role === 'tool');
    expect(assistant?.tool_calls).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'call_test' })]));
    expect(result?.tool_call_id).toBe('call_test');
  });

  it('reports authentication errors from the real provider adapter', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Invalid API key', type: 'authentication_error' } }), { status: 401, headers: { 'content-type': 'application/json' } })));
    await expect(CodingAgent.testConnection({ provider: 'openrouter', model: 'openrouter/free', apiKey: 'bad-key' })).rejects.toThrow('Invalid API key');
  });
});
