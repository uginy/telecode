import OpenAI from 'openai';
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
 * OpenRouter provider with dynamic model loading
 */
export class OpenRouterProvider extends BaseProvider {
  readonly name = 'openrouter';
  readonly displayName = 'OpenRouter';

  private _client: OpenAI | null = null;
  private _cachedModels: Model[] = [];

  private get client(): OpenAI {
    const apiKey = this.getApiKey();
    
    if (!this._client && apiKey) {
      this._client = new OpenAI({ 
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://github.com/ais-code/vscode-extension',
          'X-Title': 'AIS Code'
        }
      });
    }
    return this._client!;
  }

  private getApiKey(): string | undefined {
    const config = vscode.workspace.getConfiguration('aisCode');
    return config.get<string>('openrouter.apiKey');
  }

  private getModel(): string {
    const config = vscode.workspace.getConfiguration('aisCode');
    return config.get<string>('openrouter.model') || 'google/gemini-2.0-flash-exp:free';
  }

  private getMaxTokens(): number {
    const config = vscode.workspace.getConfiguration('aisCode');
    return config.get<number>('maxTokens') || 4096;
  }

  private getTemperature(): number {
    const config = vscode.workspace.getConfiguration('aisCode');
    return config.get<number>('temperature') || 0.7;
  }

  isConfigured(): boolean {
    return !!this.getApiKey();
  }

  getModels(): Model[] {
    // Return cached models or defaults
    if (this._cachedModels.length > 0) {
      return this._cachedModels;
    }
    
    // Default popular free models
    return [
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)', contextWindow: 1000000, maxOutput: 8192, supportsVision: true },
      { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B (Free)', contextWindow: 131072, maxOutput: 4096, supportsVision: false },
      { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen 2.5 Coder 32B (Free)', contextWindow: 32768, maxOutput: 4096, supportsVision: false },
      { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', contextWindow: 64000, maxOutput: 8192, supportsVision: false },
      { id: 'microsoft/phi-4:free', name: 'Phi-4 (Free)', contextWindow: 16000, maxOutput: 4096, supportsVision: false }
    ];
  }

  /**
   * Fetch all available models from OpenRouter API
   */
  async fetchModels(): Promise<Model[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('OpenRouter API key is required');
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json() as { data: OpenRouterModel[] };
      
      this._cachedModels = data.data.map((m: OpenRouterModel) => ({
        id: m.id,
        name: m.name || m.id,
        contextWindow: m.context_length || 4096,
        maxOutput: 4096,
        supportsVision: m.id.includes('vision') || m.id.includes('gemini'),
        isFree: m.pricing?.prompt === '0' && m.pricing?.completion === '0'
      }));

      return this._cachedModels;
    } catch (error) {
      console.error('Failed to fetch OpenRouter models:', error);
      return this.getModels(); // Return defaults on error
    }
  }

  async complete(messages: Message[], callbacks: StreamCallbacks): Promise<UsageStats> {
    if (!this.isConfigured()) {
      callbacks.onError(new Error('OpenRouter API key is not configured'));
      return { inputTokens: 0, outputTokens: 0, totalCost: 0 };
    }

    const systemPrompt = this.buildSystemPrompt();
    
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
    ];

    let fullResponse = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = await this.client.chat.completions.create({
        model: this.getModel(),
        max_tokens: this.getMaxTokens(),
        temperature: this.getTemperature(),
        messages: openaiMessages,
        stream: true
      });

      for await (const chunk of stream) {
        if (callbacks.signal?.aborted) {
          break;
        }

        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullResponse += delta.content;
          callbacks.onToken(delta.content);
        }

        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }

      callbacks.onComplete(fullResponse);

    } catch (error) {
      if (error instanceof Error) {
        callbacks.onError(error);
      } else {
        callbacks.onError(new Error('Unknown error during OpenRouter completion'));
      }
    }

    return {
      inputTokens,
      outputTokens,
      totalCost: 0 // Free tier
    };
  }
}
