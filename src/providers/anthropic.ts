import Anthropic from '@anthropic-ai/sdk';
import * as vscode from 'vscode';
import { BaseProvider, Message, Model, StreamCallbacks, UsageStats } from './base';

export class AnthropicProvider extends BaseProvider {
  readonly name = 'anthropic';
  readonly displayName = 'Anthropic Claude';

  private _client: Anthropic | null = null;

  private get client(): Anthropic {
    if (!this._client) {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        throw new Error('Anthropic API key not configured. Please set it in VS Code settings.');
      }
      this._client = new Anthropic({ apiKey });
    }
    return this._client;
  }

  private getApiKey(): string | undefined {
    const config = vscode.workspace.getConfiguration('aisCode');
    return config.get<string>('anthropic.apiKey');
  }

  private getModel(): string {
    const config = vscode.workspace.getConfiguration('aisCode');
    return this.requestOverrides?.modelId
      || config.get<string>('anthropic.model')
      || 'claude-sonnet-4-20250514';
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
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        contextWindow: 200000,
        maxOutput: 64000,
        supportsVision: true,
        pricing: { inputPerMillion: 3, outputPerMillion: 15 }
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        contextWindow: 200000,
        maxOutput: 8192,
        supportsVision: true,
        pricing: { inputPerMillion: 3, outputPerMillion: 15 }
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        contextWindow: 200000,
        maxOutput: 8192,
        supportsVision: true,
        pricing: { inputPerMillion: 0.25, outputPerMillion: 1.25 }
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        contextWindow: 200000,
        maxOutput: 4096,
        supportsVision: true,
        pricing: { inputPerMillion: 15, outputPerMillion: 75 }
      }
    ];
  }

  async complete(messages: Message[], callbacks: StreamCallbacks): Promise<UsageStats> {
    const systemPrompt = this.buildSystemPrompt();
    
    // Convert messages to Anthropic format
    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }));

    let fullResponse = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = this.client.messages.stream({
        model: this.getModel(),
        max_tokens: this.getMaxTokens(),
        temperature: this.getTemperature(),
        system: systemPrompt,
        messages: anthropicMessages
      });

      // Handle abort signal
      if (callbacks.signal) {
        callbacks.signal.addEventListener('abort', () => {
          stream.abort();
        });
      }

      for await (const event of stream) {
        if (callbacks.signal?.aborted) {
          break;
        }

        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const token = event.delta.text;
          fullResponse += token;
          callbacks.onToken(token);
        }
      }

      // Get final message for usage stats
      const finalMessage = await stream.finalMessage();
      inputTokens = finalMessage.usage.input_tokens;
      outputTokens = finalMessage.usage.output_tokens;

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
