import { describe, it, expect, vi } from 'vitest';
import { CodingAgent, createAgent, getLastAssistantText, type TelecodeConfig } from '../src/agent/codingAgent';
import type { AgentMessage } from '@mariozechner/pi-agent-core';

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
