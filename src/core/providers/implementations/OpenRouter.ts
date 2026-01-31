import * as https from 'node:https';
import { Message, ProviderConfig } from '../../types';
import { AIProvider } from '../../agent/AgentOrbit';

export class OpenRouterProvider implements AIProvider {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async complete(messages: Message[], options: { stream?: boolean, signal?: AbortSignal }): Promise<AsyncIterable<string> | string> {
    const payload = {
      model: this.config.modelId,
      messages: messages.map(m => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.content
      })),
      stream: options.stream ?? true,
      max_tokens: this.config.maxTokens ?? 4096,
      temperature: this.config.temperature ?? 0.7
    };

    if (!options.stream) {
      return this.fetchNonStreaming(payload, options.signal);
    }

    return this.fetchStreaming(payload, options.signal);
  }

  private async fetchNonStreaming(payload: any, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('Aborted'));

      const req = https.request('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': 'https://github.com/ais-code',
          'X-Title': 'AIS Code'
        },
        signal
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`OpenRouter Error ${res.statusCode}: ${data}`));
            return;
          }
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

  private async *fetchStreaming(payload: any, signal?: AbortSignal): AsyncGenerator<string, void, unknown> {
    const requestPromise = new Promise<{ res: any, status: number }>((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('Aborted'));

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': 'https://github.com/ais-code',
          'X-Title': 'AIS Code'
        },
        signal
      };
      
      const req = https.request('https://openrouter.ai/api/v1/chat/completions', options, (res) => {
        resolve({ res, status: res.statusCode || 0 });
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('OpenRouter request timed out (30s)'));
      });
      
      req.setTimeout(30000); 
      
      req.on('error', (e) => {
        if (e.name === 'AbortError') {
             reject(e);
        } else {
             console.error('[AIS Code] OpenRouter Network Error:', e);
             reject(new Error(`Network error: ${e.message}`));
        }
      });

      req.write(JSON.stringify(payload));
      req.end();
    });

    const { res, status } = await requestPromise;

    if (status >= 400) {
      let errorBody = '';
      for await (const chunk of res) {
        errorBody += chunk;
      }
      throw new Error(`OpenRouter API Error (${status}): ${errorBody}`);
    }

    let buffer = '';
    
    for await (const chunk of res) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      
      // Keep the last line in the buffer as it might be incomplete
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        if (trimmedLine.startsWith('data: ')) {
          if (trimmedLine.includes('[DONE]')) return;
          try {
            const json = JSON.parse(trimmedLine.substring(6));
            const token = json.choices[0]?.delta?.content;
            if (token) yield token;
          } catch (e) {
            // Partial JSON or other error, legitimate to ignore in stream
          }
        }
      }
    }
  }
}
