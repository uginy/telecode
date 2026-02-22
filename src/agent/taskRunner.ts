import { createRuntime } from '../engine/createRuntime';
import type { AgentRuntime, RuntimeConfig, RuntimeEvent } from '../engine/types';
import type { AgentTool, AgentMessage } from '@mariozechner/pi-agent-core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type TaskRunnerState = 'idle' | 'running' | 'error' | 'stopped';

/**
 * TaskRunner encapsulates the lifecycle of an AgentRuntime.
 * It manages starting, stopping, handling events, and the inactivity watchdog.
 * Fixes architectural duplication between extension.ts and telegram.ts.
 */
export class TaskRunner {
  private runtime: AgentRuntime | null = null;
  private unsubscribeEvents: (() => void) | null = null;
  private state: TaskRunnerState = 'idle';
  private lastActivityAt = 0;
  private watchdogTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly onEvent: (event: RuntimeEvent) => void,
    private readonly onStateChange: (state: TaskRunnerState) => void,
    /** Inactivity timeout in milliseconds (e.g. 180_000 for 3 minutes) */
    private readonly watchdogTimeoutMs = 180_000,
    private readonly workspaceRoot?: string
  ) {}

  public get currentState(): TaskRunnerState {
    return this.state;
  }

  public get getRuntime(): AgentRuntime | null {
    return this.runtime;
  }

  /**
   * Initialize a new runtime instance without running a task yet.
   */
  public initRuntime(config: RuntimeConfig, tools: AgentTool[]): AgentRuntime {
    this.abortCurrentRun();
    
    // Attempt to load previous session history
    const history = this.loadHistorySync();
    if (history) {
      config.initialMessages = history;
    }

    const created = createRuntime(config, tools);
    this.runtime = created.runtime;
    this.unsubscribeEvents = this.runtime.onEvent((e) => {
      this.lastActivityAt = Date.now();
      if (e.type === 'done' || e.type === 'error') {
        this.stopWatchdog();
        this.setState(e.type === 'error' ? 'error' : 'idle');
        this.saveHistoryAsync();
      }
      this.onEvent(e);
    });
    
    return this.runtime;
  }

  /**
   * Run a prompt (task) on the active runtime.
   */
  public async runTask(prompt: string): Promise<void> {
    if (!this.runtime) {
      throw new Error('Runtime not initialized');
    }
    if (this.state === 'running') {
      throw new Error('Agent is already running a task.');
    }

    this.setState('running');
    this.lastActivityAt = Date.now();
    this.startWatchdog();

    try {
      await this.runtime.prompt(prompt);
    } catch (e) {
      this.stopWatchdog();
      this.setState('error');
      throw e;
    }
  }

  /**
   * Forcefully abort the current task.
   */
  public abortCurrentRun(): void {
    if (this.runtime) {
      this.runtime.abort();
    }
    this.stopWatchdog();
    
    if (this.unsubscribeEvents) {
      this.unsubscribeEvents();
      this.unsubscribeEvents = null;
    }
    this.runtime = null;
    this.setState('stopped');
  }

  private setState(newState: TaskRunnerState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.onStateChange(newState);
    }
  }

  // --- Watchdog Mechanism ---

  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      const inactiveForMs = Date.now() - this.lastActivityAt;
      if (this.state === 'running' && inactiveForMs >= this.watchdogTimeoutMs) {
        this.onEvent({ type: 'error', message: `Task aborted due to inactivity (> ${this.watchdogTimeoutMs / 1000}s)` });
        this.abortCurrentRun();
      }
    }, 10_000); // Check every 10 seconds
  }

  private stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  // --- Persistent History ---
  private get historyFile(): string | null {
    if (!this.workspaceRoot) return null;
    return path.join(this.workspaceRoot, '.aiscode', 'session.json');
  }

  private loadHistorySync(): AgentMessage[] | null {
    const file = this.historyFile;
    if (!file) return null;
    
    try {
      // @ts-ignore (we use require for blocking sync read to block init)
      const data = require('node:fs').readFileSync(file, 'utf-8');
      return JSON.parse(data) as AgentMessage[];
    } catch {
      return null;
    }
  }

  private async saveHistoryAsync(): Promise<void> {
    const file = this.historyFile;
    if (!file || !this.runtime?.getMessages) return;

    try {
      const msgs = this.runtime.getMessages();
      if (!msgs || msgs.length === 0) return;
      
      const dir = path.dirname(file);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file, JSON.stringify(msgs, null, 2), 'utf-8');
    } catch {
      // fail silently
    }
  }

  public clearHistorySync(): void {
    const file = this.historyFile;
    if (!file) return;
    try {
      // @ts-ignore
      require('node:fs').unlinkSync(file);
    } catch {
      // Ignore if file doesn't exist
    }
  }
}
