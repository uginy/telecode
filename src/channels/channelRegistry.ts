/**
 * ChannelRegistry — manages the lifecycle of all messaging channels.
 *
 * Instead of separate global variables per channel (e.g. `telegramChannel`),
 * all channels are registered here. Adding a new channel means registering it;
 * removing means un-registering. No changes to extension.ts internals needed.
 */
import type { IChannel } from './types';

export class ChannelRegistry {
  private readonly channels = new Map<string, IChannel>();

  /** Register a channel. Replaces any existing channel with the same id. */
  register(channel: IChannel): void {
    const existing = this.channels.get(channel.id);
    if (existing) {
      existing.stop();
    }
    this.channels.set(channel.id, channel);
  }

  /** Unregister and stop a channel by id. */
  unregister(id: string): void {
    const channel = this.channels.get(id);
    if (channel) {
      channel.stop();
      this.channels.delete(id);
    }
  }

  /** Get a channel by id, or undefined if not registered. */
  get(id: string): IChannel | undefined {
    return this.channels.get(id);
  }

  /** Start all registered channels. */
  async startAll(): Promise<void> {
    await Promise.allSettled(
      [...this.channels.values()].map((ch) => ch.start())
    );
  }

  /** Stop all registered channels and clear the registry. */
  stopAll(): void {
    for (const channel of this.channels.values()) {
      channel.stop();
    }
    this.channels.clear();
  }

  /** Abort the running task on all channels (without disconnecting). */
  stopAllCurrentTasks(): void {
    for (const channel of this.channels.values()) {
      channel.stopCurrentTask();
    }
  }

  /** Returns ids of all active (started) channels. */
  activeIds(): string[] {
    return [...this.channels.entries()]
      .filter(([, ch]) => ch.isActive())
      .map(([id]) => id);
  }

  get size(): number {
    return this.channels.size;
  }
}
