export type WhatsAppAccessMode = 'self' | 'allowlist' | 'all';

export type WhatsAppSenderContext = {
  mode: WhatsAppAccessMode;
  allowedPhones: string[];
  fromMe: boolean;
  msg: unknown;
  chatId: string;
};

export function normalizeWhatsappPhone(input: string): string | null {
  const normalized = input.replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (!normalized) {
    return null;
  }
  if (normalized.length < 7 || normalized.length > 15) {
    return null;
  }
  return normalized;
}

export function extractWhatsappSenderPhone(msg: unknown, chatId: string): string | null {
  const record = typeof msg === 'object' && msg ? (msg as Record<string, unknown>) : {};
  const author = typeof record.author === 'string' ? record.author : '';
  const from = typeof record.from === 'string' ? record.from : '';
  const candidate = author || from || chatId;
  const bare = candidate.split('@')[0] || '';
  return normalizeWhatsappPhone(bare);
}

export function isWhatsappSenderAllowed(ctx: WhatsAppSenderContext): boolean {
  if (ctx.mode === 'all') {
    return true;
  }
  if (ctx.mode === 'self') {
    return ctx.fromMe;
  }
  if (ctx.fromMe) {
    return true;
  }
  const sender = extractWhatsappSenderPhone(ctx.msg, ctx.chatId);
  if (!sender) {
    return false;
  }
  const normalizedAllowed = new Set(
    ctx.allowedPhones.map(normalizeWhatsappPhone).filter((item): item is string => item !== null)
  );
  return normalizedAllowed.has(sender);
}
