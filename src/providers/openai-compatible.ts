import type OpenAI from 'openai';
import * as vscode from 'vscode';
import { BaseProvider, Message, Model, StreamCallbacks, UsageStats } from './base';

/**
 * OpenAI-Compatible provider for local/free APIs:
 * - Ollama (localhost:11434)
 * - LM Studio (localhost:1234)
 * - OpenRouter (free tier)
 * - Any OpenAI-compatible API
 */
export class OpenAICompatibleProvider extends BaseProvider {
  readonly name = 'openai-compatible';
  readonly displayName = 'OpenAI Compatible (Local/Free)';

  private _client: OpenAI | null = null;

  private get client(): OpenAI {
    const baseUrl = this.getBaseUrl();
    const apiKey = this.getApiKey() || 'not-needed'; // Some local APIs don't need key
    
    // Recreate client if base URL changed
    if (!this._client || this._client.baseURL !== baseUrl) {
      this._client = new OpenAI({ 
        apiKey,
        baseURL: baseUrl
      });
    }
    return this._client;
  }

  private getBaseUrl(): string {
    const config = vscode.workspace.getConfiguration('aisCode');
    return config.get<string>('openaiCompatible.baseUrl') || 'http://localhost:11434/v1';
  }

  private getApiKey(): string | undefined {
    const config = vscode.workspace.getConfiguration('aisCode');
    return config.get<string>('openaiCompatible.apiKey');
  }

  private getModel(): string {
    const config = vscode.workspace.getConfiguration('aisCode');
    return config.get<string>('openaiCompatible.model') || 'llama3.2';
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
    // Always configured - local APIs don't require API key
    return true;
  }

  getModels(): Model[] {
    // Common local models - user can set any model name in settings
    return [
      {
        id: 'llama3.2',
        name: 'Llama 3.2 (Ollama)',
        contextWindow: 128000,
        maxOutput: 4096,
        supportsVision: false
      },
      {
        id: 'qwen2.5-coder',
        name: 'Qwen 2.5 Coder (Ollama)',
        contextWindow: 32000,
        maxOutput: 4096,
        supportsVision: false
      },
      {
        id: 'deepseek-coder-v2',
        name: 'DeepSeek Coder V2 (Ollama)',
        contextWindow: 128000,
        maxOutput: 4096,
        supportsVision: false
      },
      {
        id: 'codestral',
        name: 'Codestral (Ollama)',
        contextWindow: 32000,
        maxOutput: 4096,
        supportsVision: false
      },
      {
        id: 'custom',
        name: 'Custom Model (set in settings)',
        contextWindow: 32000,
        maxOutput: 4096,
        supportsVision: false
      }
    ];
  }

  async complete(messages: Message[], callbacks: StreamCallbacks): Promise<UsageStats> {
    const systemPrompt = this.buildSystemPrompt();
    
    // Convert messages to OpenAI format
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

        // Some providers include usage in chunks
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }

      callbacks.onComplete(fullResponse);

    } catch (error) {
      if (error instanceof Error) {
        // Provide helpful error messages for common issues
        let errorMessage = error.message;
        if (error.message.includes('ECONNREFUSED')) {
          errorMessage = `Cannot connect to ${this.getBaseUrl()}. Make sure Ollama/LM Studio is running.`;
        } else if (error.message.includes('model')) {
          errorMessage = `Model "${this.getModel()}" not found. Run: ollama pull ${this.getModel()}`;
        }
        callbacks.onError(new Error(errorMessage));
      } else {
        callbacks.onError(new Error('Unknown error during completion'));
      }
    }

    return {
      inputTokens,
      outputTokens,
      totalCost: 0 // Free!
    };
  }
}
