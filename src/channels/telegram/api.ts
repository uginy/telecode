import { Bot, InputFile } from 'grammy';
import * as path from 'node:path';
import { readTelecodeSettings } from '../../config/settings';
import { isRecord, resolveExistingPath, buildMissingPathError } from './utils';

export const TELEGRAM_MAX_DOCUMENT_BYTES = 49 * 1024 * 1024;

export class TelegramApiService {
  constructor(
    private readonly bot: Bot | null,
    private readonly pushLog: (line: string) => void
  ) {}

  public async callApi(method: string, params: unknown): Promise<unknown> {
    if (!this.bot) {
      throw new Error('Telegram bot is not running.');
    }

    const normalizedMethod = method.trim().replace(/^\/+/, '');
    if (!normalizedMethod) {
      throw new Error('Telegram API method is empty');
    }

    const payload = isRecord(params) ? params : {};
    const rawApi = this.bot.api.raw as Record<string, ((arg?: unknown) => Promise<unknown>) | undefined>;
    const methodFn = rawApi[normalizedMethod];
    if (typeof methodFn === 'function') {
      const result = Object.keys(payload).length > 0 ? await methodFn(payload) : await methodFn();
      this.pushLog(`[telegram:api] method=${normalizedMethod} mode=grammy`);
      return result;
    }

    if (this.containsInputFile(payload)) {
      throw new Error(
        `Method ${normalizedMethod} is not in current grammY raw API and payload contains file uploads. ` +
          'Update grammY or use a supported method for multipart upload.'
      );
    }

    const httpResult = await this.callApiOverHttp(normalizedMethod, payload);
    this.pushLog(`[telegram:api] method=${normalizedMethod} mode=http`);
    return httpResult;
  }

  private async callApiOverHttp(method: string, payload: Record<string, unknown>): Promise<unknown> {
    const settings = readTelecodeSettings();
    const token = settings.telegram.botToken.trim();
    if (!token) {
      throw new Error('telegram.botToken is empty');
    }

    const apiRoot = (settings.telegram.apiRoot || 'https://api.telegram.org').trim().replace(/\/+$/, '');
    const url = `${apiRoot}/bot${token}/${method}`;

    const nativeFetch = (globalThis as { fetch?: typeof fetch }).fetch;
    if (typeof nativeFetch !== 'function') {
      throw new Error('Fetch is not available in current runtime for HTTP fallback');
    }

    const response = await nativeFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Telegram HTTP fallback returned non-JSON response (${response.status})`);
    }

    if (!isRecord(body)) {
      throw new Error(`Telegram HTTP fallback returned unexpected payload (${response.status})`);
    }

    const ok = body.ok;
    if (ok !== true) {
      const description = typeof body.description === 'string' ? body.description : 'unknown Telegram API error';
      const code = typeof body.error_code === 'number' ? body.error_code : response.status;
      throw new Error(`Telegram API ${method} failed (${code}): ${description}`);
    }

    return body.result;
  }

  public async prepareParams(value: unknown, workspaceRoot: string): Promise<unknown> {
    if (Array.isArray(value)) {
      const result: unknown[] = [];
      for (const item of value) {
        result.push(await this.prepareParams(item, workspaceRoot));
      }
      return result;
    }

    if (!isRecord(value)) {
      return value;
    }

    const prepared: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value)) {
      if (key.endsWith('Path') && typeof raw === 'string') {
        const targetKey = key.slice(0, -4);
        prepared[targetKey] = await this.toInputFile(raw, workspaceRoot);
        continue;
      }

      if (key.endsWith('Paths') && Array.isArray(raw)) {
        const targetKey = key.slice(0, -5);
        const files: InputFile[] = [];
        for (const item of raw) {
          if (typeof item !== 'string') {
            throw new Error(`${key} must contain only string paths`);
          }
          files.push(await this.toInputFile(item, workspaceRoot));
        }
        prepared[targetKey] = files;
        continue;
      }

      prepared[key] = await this.prepareParams(raw, workspaceRoot);
    }

    return prepared;
  }

  public async toInputFile(rawPath: string, workspaceRoot: string): Promise<InputFile> {
    const normalized = rawPath.trim();
    if (!normalized) {
      throw new Error('Upload path cannot be empty');
    }

    const resolved = await resolveExistingPath(normalized, workspaceRoot);
    if (!resolved) {
      throw new Error(buildMissingPathError(normalized, workspaceRoot));
    }
    const absolutePath = resolved.path;
    const stat = resolved.stat;
    if (!stat.isFile()) {
      throw new Error(`Upload path is not a file: ${absolutePath}`);
    }

    const sizeBytes = typeof stat.size === 'bigint' ? Number(stat.size) : stat.size;
    if (sizeBytes > TELEGRAM_MAX_DOCUMENT_BYTES) {
      throw new Error(
        `File is too large for Telegram Bot API (${Math.ceil(sizeBytes / (1024 * 1024))}MB > ${Math.ceil(
          TELEGRAM_MAX_DOCUMENT_BYTES / (1024 * 1024)
        )}MB).`
      );
    }

    return new InputFile(absolutePath, path.basename(absolutePath));
  }

  private containsInputFile(value: unknown): boolean {
    if (value instanceof InputFile) {
      return true;
    }

    if (Array.isArray(value)) {
      return value.some((entry) => this.containsInputFile(entry));
    }

    if (!isRecord(value)) {
      return false;
    }

    return Object.values(value).some((entry) => this.containsInputFile(entry));
  }
}
