import { describe, expect, it, vi } from 'vitest';

const { settings, Bot, warn } = vi.hoisted(() => ({
  settings: { agent: { language: 'en' }, telegram: { enabled: true, botToken: 'test-token', chatId: '' } },
  Bot: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('vscode', () => ({ window: { showWarningMessage: warn }, DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 } }));
vi.mock('grammy', () => ({ Bot }));
vi.mock('../src/config/settings', () => ({ readTelecodeSettings: () => settings }));
vi.mock('../src/services/i18n', () => ({ i18n: { t: {}, setLanguage: vi.fn() } }));
import { TelegramChannel } from '../src/channels/telegram/channel';

describe('Telegram access', () => {
  it.each(['', 'not-an-id', '0'])('does not connect with invalid allowed chat ID %j', async (chatId) => {
    settings.telegram.chatId = chatId;
    const manager = { unregisterExecutor: vi.fn() };
    const status = vi.fn();
    const channel = new TelegramChannel([], '/tmp/telecode-access-test', manager as never, manager as never, vi.fn(), status);
    await channel.start();
    expect(Bot).not.toHaveBeenCalled();
    expect(channel.isActive()).toBe(false);
    expect(status).toHaveBeenLastCalledWith('Error');
    expect(warn).toHaveBeenCalled();
  });
});
