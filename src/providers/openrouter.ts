import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { URL } from 'url';
import * as vscode from 'vscode';
import { BaseProvider, type Message, type Model, type StreamCallbacks, type UsageStats } from './base';

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

/**
 * OpenRouter provider using native Node.js https module to bypass VS Code fetch/proxy issues
 */
export class OpenRouterProvider extends BaseProvider {
  readonly name = 'openrouter';
  readonly displayName = 'OpenRouter';

  private _cachedModels: Model[] = [];

  private getApiKey(): string | undefined {
    const config = vscode.workspace.getConfiguration('aisCode');
    return config.get<string>('openrouter.apiKey');
  }

  private getModel(): string {
    const config = vscode.workspace.getConfiguration('aisCode');
    return this.requestOverrides?.modelId
      || config.get<string>('openrouter.model')
      || 'google/gemini-2.0-flash-exp:free';
  }

  private getMaxTokens(): number {
    const config = vscode.workspace.getConfiguration('aisCode');
    return this.requestOverrides?.maxTokens
      || config.get<number>('maxTokens')
      || 4096;
  }

  private getTemperature(): number {
    const config = vscode.workspace.getConfiguration('aisCode');
    return this.requestOverrides?.temperature
      ?? config.get<number>('temperature')
      ?? 0.7;
  }

  private getLogPath(): string | null {
    if (process.env.AIS_CODE_TEST_MODE !== '1') {
      return null;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      return path.join(workspaceRoot, '.vscode-test', 'logs', 'llm-openrouter.log');
    }

    return path.join(os.tmpdir(), 'ais-code-llm-openrouter.log');
  }

  private appendLog(line: string): void {
    const logPath = this.getLogPath();
    if (!logPath) return;
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, `${line}\n`);
    } catch (error) {
      console.error('Failed to write LLM log:', error);
    }
  }

  private logRequestStart(requestId: string, payload: { model: string; messages: Array<{ role: string; content: string }>; max_tokens: number; temperature: number }) {
    const now = new Date().toISOString();
    const messageCount = payload.messages.length;
    const totalChars = payload.messages.reduce((sum, m) => sum + m.content.length, 0);
    this.appendLog(`[${now}] request.start id=${requestId} model=${payload.model} messages=${messageCount} chars=${totalChars} max_tokens=${payload.max_tokens} temp=${payload.temperature}`);
  }

  private logRequestEnd(requestId: string, statusCode: number | undefined, durationMs: number) {
    const now = new Date().toISOString();
    this.appendLog(`[${now}] request.end id=${requestId} status=${statusCode ?? 'unknown'} duration_ms=${durationMs}`);
  }

  private logRequestError(requestId: string, message: string) {
    const now = new Date().toISOString();
    this.appendLog(`[${now}] request.error id=${requestId} message=${message}`);
  }

  isConfigured(): boolean {
    return !!this.getApiKey();
  }

  getModels(): Model[] {
    if (this._cachedModels.length > 0) return this._cachedModels;
    return [
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)', contextWindow: 1000000, maxOutput: 8192, supportsVision: true },
      { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B (Free)', contextWindow: 131072, maxOutput: 4096, supportsVision: false },
      { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen 2.5 Coder 32B (Free)', contextWindow: 32768, maxOutput: 4096, supportsVision: false },
      { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', contextWindow: 64000, maxOutput: 8192, supportsVision: false },
      { id: 'microsoft/phi-4:free', name: 'Phi-4 (Free)', contextWindow: 16000, maxOutput: 4096, supportsVision: false }
    ];
  }

  async fetchModels(): Promise<Model[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('OpenRouter API key is required');

    try {
      console.log('Fetching models via https module (bypass fetch)...');
      const data = await this._makeRequest< { data: OpenRouterModel[] }>('GET', '/api/v1/models', apiKey);
      
      this._cachedModels = data.data.map((m) => {
        const promptPrice = parseFloat(m.pricing?.prompt || '0');
        const completionPrice = parseFloat(m.pricing?.completion || '0');
        const isFree = promptPrice === 0 && completionPrice === 0;

        return {
          id: m.id,
          name: m.name || m.id,
          contextWindow: m.context_length || 4096,
          maxOutput: 4096,
          supportsVision: m.id.includes('vision') || m.id.includes('gemini'),
          isFree,
          pricing: {
            inputPerMillion: parseFloat(m.pricing?.prompt || '0') * 1000000,
            outputPerMillion: parseFloat(m.pricing?.completion || '0') * 1000000
          }
        };
      });

      return this._cachedModels;
    } catch (error) {
      console.error('Failed to fetch OpenRouter models:', error);
      throw error;
    }
  }

  async complete(messages: Message[], callbacks: StreamCallbacks): Promise<UsageStats> {
    if (!this.isConfigured()) {
      callbacks.onError(new Error('OpenRouter API key is not configured'));
      return { inputTokens: 0, outputTokens: 0, totalCost: 0 };
    }

    const systemPrompt = this.buildSystemPrompt();
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role,
        content: m.content
      }))
    ];

    const payload = {
      model: this.getModel(),
      messages: apiMessages,
      stream: true,
      max_tokens: this.getMaxTokens(),
      temperature: this.getTemperature()
    };

    console.log('Starting stream via https module...');

    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const startedAt = Date.now();
    this.logRequestStart(requestId, {
      model: payload.model,
      messages: payload.messages,
      max_tokens: payload.max_tokens,
      temperature: payload.temperature
    });

    return new Promise<UsageStats>((resolve) => {
      const url = new URL('https://openrouter.ai/api/v1/chat/completions');
      const options = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.getApiKey()}`,
          'HTTP-Referer': 'https://github.com/ais-code/vscode-extension',
          'X-Title': 'AIS Code',
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60s timeout
      };

      const req = https.request(url, options, (res) => {
        this.logRequestEnd(requestId, res.statusCode, Date.now() - startedAt);
        if (res.statusCode && res.statusCode >= 400) {
           let errorBody = '';
           res.on('data', chunk => errorBody += chunk);
           res.on('end', () => {
             console.error(`Status ${res.statusCode}: ${errorBody}`);
             this.logRequestError(requestId, `status=${res.statusCode} body=${errorBody.slice(0, 200)}`);
             callbacks.onError(new Error(`OpenRouter Error ${res.statusCode}: ${errorBody}`));
             resolve({ inputTokens: 0, outputTokens: 0, totalCost: 0 });
           });
           return;
        }

        let buffer = '';
        let accumulated = '';

        res.on('data', (chunk) => {
          if (callbacks.signal?.aborted) {
            req.destroy();
            return;
          }

          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const json = JSON.parse(data);
              const content = json.choices[0]?.delta?.content || '';
              if (content) {
                accumulated += content;
                callbacks.onToken(content);
              }
            } catch {
              // ignore
            }
          }
        });

        res.on('end', () => {
          callbacks.onComplete(accumulated);
          resolve({ inputTokens: 0, outputTokens: 0, totalCost: 0 });
        });

        res.on('error', (err) => {
          this.logRequestError(requestId, err.message);
          callbacks.onError(err);
          resolve({ inputTokens: 0, outputTokens: 0, totalCost: 0 });
        });
      });

      req.on('error', (err) => {
        console.error('Network request failed:', err);
        this.logRequestError(requestId, err.message);
        callbacks.onError(err);
        resolve({ inputTokens: 0, outputTokens: 0, totalCost: 0 });
      });

      // Handle abort
      if (callbacks.signal) {
        callbacks.signal.addEventListener('abort', () => {
          req.destroy();
        });
      }

      req.write(JSON.stringify(payload));
      req.end();
    });
  }

  /**
   * Helper for non-streaming requests
   */
  private _makeRequest<T>(method: string, path: string, apiKey: string, body?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(`https://openrouter.ai${path}`);
      const options = {
        method,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/ais-code/vscode-extension',
          'X-Title': 'AIS Code',
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(url, options, (res) => {
        let responseBody = '';

        res.on('data', chunk => responseBody += chunk);
        
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`API Error ${res.statusCode}: ${responseBody}`));
          } else {
            try {
              resolve(JSON.parse(responseBody));
            } catch {
              reject(new Error(`Invalid JSON: ${responseBody}`));
            }
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
}
