import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { TelegramApiService } from './api';
import { formatError, runCommand } from './utils';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';

const telegramSendFileParams = Type.Object({
  path: Type.String({ description: 'Absolute path or path relative to current workspace' }),
  archive: Type.Optional(Type.Boolean({ description: 'Zip file/folder before sending (default false)' })),
  archiveName: Type.Optional(Type.String({ description: 'Optional zip file name without path' })),
  caption: Type.Optional(Type.String({ description: 'Optional Telegram caption' })),
});

type TelegramSendFileParams = Static<typeof telegramSendFileParams>;

const telegramApiCallParams = Type.Object({
  method: Type.String({ description: 'Telegram Bot API method name, e.g. getChat or setMyCommands' }),
  params: Type.Optional(Type.Any({ description: 'Method params as JSON object. Use *Path fields for file uploads.' })),
});

type TelegramApiCallParams = Static<typeof telegramApiCallParams>;

export function createTelegramTools(
  apiService: TelegramApiService,
  chatId: number | null,
  workspaceRoot: string,
  pushLog: (line: string) => void
): AgentTool[] {
  return [
    {
      name: 'telegram_send_file',
      description: 'Upload a file or folder to the active Telegram chat.',
      parameters: telegramSendFileParams,
      label: 'TG: Send File',
      execute: async (_toolCallId, params) => {
        const typed = params as TelegramSendFileParams;
        if (chatId === null) {
          throw new Error('Telegram chat is not active.');
        }

        const normalizedPath = typed.path.trim();
        if (!normalizedPath) {
          throw new Error('Path is required');
        }

        const resolved = await resolveExistingPath(normalizedPath, workspaceRoot);
        if (!resolved) {
          throw new Error(buildMissingPathError(normalizedPath, workspaceRoot));
        }

        const absolutePath = resolved.path;
        const stat = resolved.stat;
        const shouldArchive = !!typed.archive || stat.isDirectory();

        let uploadPath = absolutePath;
        let cleanup: (() => Promise<void>) | null = null;

        if (shouldArchive) {
          const { archivePath, tempDir } = await createZipArchive(absolutePath, typed.archiveName);
          uploadPath = archivePath;
          cleanup = async () => {
            try {
              await fs.rm(tempDir, { recursive: true, force: true });
            } catch {
              // ignore
            }
          };
        }

        try {
          const method = resolveTelegramSendMethod(uploadPath);
          const file = await apiService.toInputFile(uploadPath, workspaceRoot);
          const argKey = method === 'sendPhoto' ? 'photo' : method === 'sendAudio' ? 'audio' : method === 'sendVideo' ? 'video' : method === 'sendVoice' ? 'voice' : 'document';

          const result = await apiService.callApi(method, {
            chat_id: chatId,
            [argKey]: file,
            caption: typed.caption,
          });

          pushLog(`[telegram:send] path=${normalizedPath} method=${method} archive=${shouldArchive}`);

          return {
            content: [{ type: 'text', text: `File sent successfully via ${method}.` }],
            details: { path: absolutePath, method, archived: shouldArchive, result },
          };
        } finally {
          if (cleanup) {
            await cleanup();
          }
        }
      },
    },
    {
      name: 'telegram_api_call',
      description: 'Call any Telegram Bot API method. Use *Path (e.g. photoPath) for file uploads.',
      parameters: telegramApiCallParams,
      label: 'TG: API Call',
      execute: async (_toolCallId, params) => {
        const typed = params as TelegramApiCallParams;
        const method = typed.method.trim();
        const rawParams = typed.params || {};

        const prepared = await apiService.prepareParams(rawParams, workspaceRoot);
        const response = await apiService.callApi(method, prepared);

        return {
          content: [{ type: 'text', text: `API call ${method} success.` }],
          details: { method, response },
        };
      },
    }
  ];
}

import { resolveExistingPath, buildMissingPathError } from './utils';

function resolveTelegramSendMethod(filePath: string): 'sendVoice' | 'sendAudio' | 'sendVideo' | 'sendPhoto' | 'sendDocument' {
  const ext = path.extname(filePath).toLowerCase();
  if (['.mp3', '.m4a', '.flac', '.wav'].includes(ext)) {
    return 'sendAudio';
  }
  if (['.ogg', '.oga'].includes(ext)) {
    return 'sendVoice';
  }
  if (['.mp4', '.mov', '.mkv', '.avi'].includes(ext)) {
    return 'sendVideo';
  }
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return 'sendPhoto';
  }
  return 'sendDocument';
}

async function createZipArchive(targetPath: string, archiveName?: string): Promise<{ archivePath: string; tempDir: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telecode-ai-tg-'));
  const sourceName = path.basename(targetPath);
  const normalizedName = (archiveName || sourceName || 'artifact').trim().replace(/[\\/]/g, '_');
  const fileName = normalizedName.toLowerCase().endsWith('.zip') ? normalizedName : `${normalizedName}.zip`;
  const archivePath = path.join(tempDir, fileName);
  const sourceDir = path.dirname(targetPath);

  try {
    await runCommand('zip', ['-r', '-q', archivePath, sourceName], sourceDir, 120_000);
  } catch (zipError) {
    try {
      await runCommand('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', targetPath, archivePath], sourceDir, 120_000);
    } catch (dittoError) {
      const zipMessage = formatError(zipError);
      const dittoMessage = formatError(dittoError);
      throw new Error(`Failed to create zip archive. zip: ${zipMessage}; ditto: ${dittoMessage}`);
    }
  }

  return { archivePath, tempDir };
}
