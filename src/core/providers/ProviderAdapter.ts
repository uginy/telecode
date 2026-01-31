import type { Message as CoreMessage } from '../types';
import type { AIProvider as CoreAIProvider } from '../agent/AgentOrbit';
import type { CompletionOverrides, Message as BaseMessage, StreamCallbacks } from '../../providers/base';
import { BaseProvider } from '../../providers/base';

export class ProviderAdapter implements CoreAIProvider {
  constructor(private readonly provider: BaseProvider) {}

  async complete(
    messages: CoreMessage[],
    options: { stream?: boolean; signal?: AbortSignal; overrides?: CompletionOverrides }
  ): Promise<AsyncIterable<string> | string> {
    const systemMessage = messages.find(m => m.role === 'system');
    if (systemMessage) {
      this.provider.setSystemPromptOverride(systemMessage.content);
    }

    if (options.overrides) {
      this.provider.setRequestOverrides(options.overrides);
    } else {
      this.provider.clearRequestOverrides();
    }

    const mappedMessages: BaseMessage[] = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.content,
        timestamp: m.timestamp
      }));

    if (options.stream === false) {
      try {
        return await this.completeNonStreaming(mappedMessages, options.signal);
      } finally {
        this.provider.clearRequestOverrides();
      }
    }

    return this.completeStreaming(mappedMessages, options.signal);
  }

  private async completeNonStreaming(
    messages: BaseMessage[],
    signal?: AbortSignal
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let output = '';

      const callbacks: StreamCallbacks = {
        onToken: (token) => {
          output += token;
        },
        onComplete: () => resolve(output),
        onError: (error) => reject(error),
        signal
      };

      this.provider.complete(messages, callbacks).catch(reject);
    });
  }

  private async *completeStreaming(
    messages: BaseMessage[],
    signal?: AbortSignal
  ): AsyncGenerator<string, void, unknown> {
    let done = false;
    let error: Error | null = null;
    const queue: string[] = [];
    let notify: (() => void) | null = null;

    const waitForData = () =>
      new Promise<void>((resolve) => {
        notify = resolve;
      });

    const callbacks: StreamCallbacks = {
      onToken: (token) => {
        queue.push(token);
        if (notify) {
          notify();
          notify = null;
        }
      },
      onComplete: () => {
        done = true;
        if (notify) {
          notify();
          notify = null;
        }
      },
      onError: (err) => {
        error = err;
        done = true;
        if (notify) {
          notify();
          notify = null;
        }
      },
      signal
    };

    void this.provider.complete(messages, callbacks).catch((err: unknown) => {
      error = err instanceof Error ? err : new Error(String(err));
      done = true;
      if (notify) {
        notify();
        notify = null;
      }
    });

    try {
      while (!done || queue.length > 0) {
        if (queue.length === 0) {
          await waitForData();
          continue;
        }

        const token = queue.shift();
        if (token !== undefined) {
          yield token;
        }
      }

      if (error) {
        throw error;
      }
    } finally {
      this.provider.clearRequestOverrides();
    }
  }
}
