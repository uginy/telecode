import * as https from 'node:https';
import { Message, ProviderConfig } from '../../types';
import { AIProvider } from '../../agent/AgentOrbit';

export class OpenRouterProvider implements AIProvider {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async complete(messages: Message[], options: { stream?: boolean }): Promise<AsyncIterable<string> | string> {
    const payload = {
      model: this.config.modelId,
      messages: messages.map(m => ({
        role: m.role === 'tool' ? 'user' : m.role, // Simple mapping
        content: m.content
      })),
      stream: options.stream ?? true,
      max_tokens: this.config.maxTokens ?? 4096,
      temperature: this.config.temperature ?? 0.7
    };

    if (!options.stream) {
      return this.fetchNonStreaming(payload);
    }

    return this.fetchStreaming(payload);
  }

  private async fetchNonStreaming(payload: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.request('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': 'https://github.com/ais-code',
          'X-Title': 'AIS Code'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.choices[0].message.content);
          } catch (e) {
            reject(new Error('Failed to parse OpenRouter response: ' + data));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(payload));
      req.end();
    });
  }

  private async *fetchStreaming(payload: any): AsyncIterable<string> {
    const requestPromise = new Promise<{ res: any }>((resolve, reject) => {
      const req = https.request('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': 'https://github.com/ais-code',
          'X-Title': 'AIS Code'
        }
      }, (res) => resolve({ res }));
      req.on('error', reject);
      req.write(JSON.stringify(payload));
      req.end();
    });

    const { res } = await requestPromise;

    for await (const chunk of res) {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          if (line.includes('[DONE]')) return;
          try {
            const json = JSON.parse(line.substring(6));
            const token = json.choices[0]?.delta?.content;
            if (token) yield token;
          } catch (e) {
            // Partial JSON or other error
          }
        }
      }
    }
  }
}
