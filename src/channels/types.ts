/**
 * IChannel — common interface every messaging channel must implement.
 * Adding a new channel (Discord, WhatsApp, Slack, …) requires only implementing this
 * interface and registering it in ChannelRegistry.
 */
export interface IChannel {
  /** Unique identifier, e.g. "telegram", "whatsapp", "discord". */
  readonly id: string;

  /** Human-readable name for logs and UI. */
  readonly name: string;

  /**
   * Start the channel (connect, authenticate, begin polling / webhooks).
   * Must be idempotent — calling start() when already running is a no-op.
   */
  start(): Promise<void>;

  /**
   * Gracefully stop the channel (disconnect, clean up timers).
   * Must be idempotent — calling stop() when already stopped is a no-op.
   */
  stop(): void;

  /**
   * Abort any currently running task without stopping the channel itself.
   * The channel remains connected and ready for the next request.
   */
  stopCurrentTask(): void;

  /** Whether the channel is currently active (started and not errored out). */
  isActive(): boolean;
}
