import OpenAI from 'openai';
import * as vscode from 'vscode';
import { BaseProvider, Message, Model, StreamCallbacks, UsageStats } from './base';

export class OpenAIProvider extends BaseProvider {
  readonly name = 'openai';
  readonly displayName = 'OpenAI';

  private _client: OpenAI | null = null;

  private get client(): OpenAI {
    if (!this._client) {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        throw new Error('OpenAI API key not configured. Please set it in VS Code settings.');
      }
      this._client = new OpenAI({ apiKey });
    }
    return this._client;
  }

  private getApiKey(): string | undefined {
    const config = vscode.workspace.getConfiguration('aisCode');
    return config.get<string>('openai.apiKey');
  }

  private getModel(): string {
    const config = vscode.workspace.getConfiguration('aisCode');
    return this.requestOverrides?.modelId
      || config.get<string>('openai.model')
      || 'gpt-4o';
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

  isConfigured(): boolean {
    return !!this.getApiKey();
  }

  getModels(): Model[] {
    return [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        contextWindow: 128000,
        maxOutput: 16384,
        supportsVision: true,
        pricing: { inputPerMillion: 2.5, outputPerMillion: 10 }
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        contextWindow: 128000,
        maxOutput: 16384,
        supportsVision: true,
        pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 }
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        contextWindow: 128000,
        maxOutput: 4096,
        supportsVision: true,
        pricing: { inputPerMillion: 10, outputPerMillion: 30 }
      },
      {
        id: 'o1-preview',
        name: 'o1 Preview',
        contextWindow: 128000,
        maxOutput: 32768,
        supportsVision: false,
        pricing: { inputPerMillion: 15, outputPerMillion: 60 }
      },
      {
        id: 'o1-mini',
        name: 'o1 Mini',
        contextWindow: 128000,
        maxOutput: 65536,
        supportsVision: false,
        pricing: { inputPerMillion: 3, outputPerMillion: 12 }
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
        stream: true,
        stream_options: { include_usage: true }
      });

      for await (const chunk of stream) {
        if (callbacks.signal?.aborted) {
          break;
        }

        // Handle content delta
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullResponse += delta.content;
          callbacks.onToken(delta.content);
        }

        // Handle usage info (comes in final chunk)
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
        callbacks.onError(new Error('Unknown error during completion'));
      }
    }

    // Calculate cost
    const model = this.getModels().find(m => m.id === this.getModel());
    const inputCost = model?.pricing ? (inputTokens / 1_000_000) * model.pricing.inputPerMillion : 0;
    const outputCost = model?.pricing ? (outputTokens / 1_000_000) * model.pricing.outputPerMillion : 0;

    return {
      inputTokens,
      outputTokens,
      totalCost: inputCost + outputCost
    };
  }
}
