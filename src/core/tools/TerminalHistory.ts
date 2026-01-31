export interface TerminalEntry {
  command: string;
  output: string;
  timestamp: number;
}

export class TerminalHistory {
  private static _entries: TerminalEntry[] = [];
  private static _maxEntries = 5;
  private static _maxChars = 8000;

  static add(command: string, output: string) {
    const trimmedOutput = output.length > this._maxChars
      ? `${output.slice(0, this._maxChars)}\n[...truncated]`
      : output;

    this._entries.unshift({
      command,
      output: trimmedOutput,
      timestamp: Date.now()
    });

    if (this._entries.length > this._maxEntries) {
      this._entries = this._entries.slice(0, this._maxEntries);
    }
  }

  static getRecent(): TerminalEntry[] {
    return [...this._entries];
  }
}
