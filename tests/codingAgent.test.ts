import { describe, it, expect, vi, afterEach } from 'vitest';
import { CodingAgent, createAgent, getLastAssistantText, type TelecodeConfig } from '../src/agent/codingAgent';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type, createAssistantMessageEventStream, type AssistantMessage } from '@earendil-works/pi-ai';

// Mock the promptStack to avoid file system reads during tests
vi.mock('../src/prompts/promptStack', () => ({
  buildComposedSystemPrompt: () => ({
    source: 'stack',
    signature: 'mock_signature',
    layerCount: 1,
    missing: [],
    prompt: 'Mock system prompt',
  }),
}));

describe('CodingAgent', () => {
  const baseConfig: TelecodeConfig = {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: 'test-key',
    maxSteps: 10,
    cwd: '/test/cwd',
  };

  describe('Model Resolution', () => {
    it('resolves known models correctly', () => {
      const agent = createAgent(baseConfig);
      const info = agent.getModelInfo();
      expect(info.id).toBe('gpt-4o');
      expect(info.provider).toBe('openai');
    });

    it('creates openai-compatible fallback for openrouter', () => {
      const agent = createAgent({
        ...baseConfig,
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-sonnet',
      });
      const info = agent.getModelInfo();
      
      expect(info.id).toBe('anthropic/claude-3.5-sonnet');
      expect(info.provider).toBe('openrouter');
      expect(info.api).toBe('openai-completions');
      expect(info.baseUrl).toBe('https://openrouter.ai/api/v1');
    });

    it('respects custom baseUrl overrides', () => {
      const agent = createAgent({
        ...baseConfig,
        provider: 'ollama',
        model: 'llama3.1',
        baseUrl: 'http://custom:11434/v1',
      });
      const info = agent.getModelInfo();
      
      expect(info.provider).toBe('ollama');
      expect(info.baseUrl).toBe('http://custom:11434/v1');
    });
    
    it('ignores empty baseUrl overrides and uses provider default', () => {
      const agent = createAgent({
        ...baseConfig,
        provider: 'deepseek',
        model: 'deepseek-coder',
        baseUrl: '   ',
      });
      const info = agent.getModelInfo();
      expect(info.baseUrl).toBe('https://api.deepseek.com/v1');
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('rejects provider errors instead of reporting success', async () => {
    const agent = createAgent(baseConfig);
    agent.getAgent().streamFunction = () => {
      const stream = createAssistantMessageEventStream();
      stream.push({ type: 'error', reason: 'error', error: assistantMessage([], 'error', 'Invalid API key') });
      return stream;
    };
    await expect(agent.prompt('test')).rejects.toThrow('Invalid API key');
  });

  it('enforces the tool limit within a batch and resets it for the next task', async () => {
    const execute = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }], details: {} }));
    const tools: AgentTool[] = [{ name: 'test', label: 'Test', description: 'Test', parameters: Type.Object({}), execute }];
    const agent = createAgent({ ...baseConfig, maxSteps: 1 }, tools);
    agent.getAgent().streamFunction = (_model, _context, options) => {
      const stream = createAssistantMessageEventStream();
      if (options?.signal?.aborted) {
        stream.push({ type: 'error', reason: 'aborted', error: assistantMessage([], 'aborted') });
      } else {
        stream.push({ type: 'done', reason: 'toolUse', message: assistantMessage([
          { type: 'toolCall', id: 'one', name: 'test', arguments: {} },
          { type: 'toolCall', id: 'two', name: 'test', arguments: {} },
        ], 'toolUse') });
      }
      return stream;
    };
    await expect(agent.prompt('first')).rejects.toThrow('limit of 1');
    expect(execute).toHaveBeenCalledTimes(1);
    await expect(agent.prompt('second')).rejects.toThrow('limit of 1');
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('fails explicitly when unsupported manual approval is requested', () => {
    expect(() => createAgent({ ...baseConfig, autoApprove: false })).toThrow('Interactive tool approvals');
  });

  it('filters OpenRouter discovery to models with tools and exposes HTTP failures', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: [
      { id: 'chat-only', supported_parameters: [] }, { id: 'coding', supported_parameters: ['tools'] },
    ] }) }).mockResolvedValueOnce({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetch);
    await expect(CodingAgent.fetchModelsFromApi('openrouter', '', 'test')).resolves.toEqual([{ id: 'coding', free: false }]);
    await expect(CodingAgent.fetchModelsFromApi('openrouter', '', 'bad')).rejects.toThrow('HTTP 401');
  });

  it('loads native model choices for direct providers without probing an OpenAI endpoint', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const models = await CodingAgent.fetchModelsFromApi('anthropic', 'http://localhost:12345/v1', 'test');
    expect(models.length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('identifies free OpenRouter models by all advertised prices rather than their IDs', async () => {
    const models = [
      { id: 'free-without-suffix', pricing: { prompt: '0', completion: '0', request: '0' } },
      { id: 'paid:free', pricing: { prompt: '0', completion: '0.001' } },
      { id: 'request-fee', pricing: { prompt: '0', completion: '0', request: '0.01' } },
      { id: 'unknown', pricing: {} },
      { id: 'automatic-price', pricing: { prompt: '-1', completion: '-1' } },
    ].map((model) => ({ ...model, supported_parameters: ['tools'] }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: models }) }));
    await expect(CodingAgent.fetchModelsFromApi('openrouter', '', '')).resolves.toEqual([
      { id: 'free-without-suffix', free: true }, { id: 'paid:free', free: false },
      { id: 'request-fee', free: false }, { id: 'unknown', free: false }, { id: 'automatic-price', free: false },
    ]);
  });

  describe('getLastAssistantText', () => {
    it('returns empty string if no messages', () => {
      expect(getLastAssistantText([])).toBe('');
    });

    it('returns empty string if last message is not assistant', () => {
      const msgs: any[] = [{ role: 'user', content: 'hello' }];
      expect(getLastAssistantText(msgs)).toBe('');
    });

    it('extracts text from assistant message correctly', () => {
      const msgs: any[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello, ' },
            { type: 'toolCall', id: '123' },
            { type: 'text', text: 'world!' },
          ],
        },
      ];
      expect(getLastAssistantText(msgs)).toBe('Hello, world!');
    });
  });
});

function assistantMessage(content: AssistantMessage['content'], stopReason: AssistantMessage['stopReason'], errorMessage?: string): AssistantMessage {
  return { role: 'assistant', content, stopReason, errorMessage, api: 'openai-completions', provider: 'openai', model: 'gpt-4o', timestamp: Date.now(),
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
}
