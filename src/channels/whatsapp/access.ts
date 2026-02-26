export type WhatsAppAccessMode = 'self' | 'allowlist' | 'all';

export type WhatsAppSenderContext = {
  mode: WhatsAppAccessMode;
  allowedPhones: string[];
  fromMe: boolean;
  msg: {
    key?: {
      remoteJid?: string;
      participant?: string;
    };
  };
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

/**
 * Extract the sender phone number from a Baileys message.
 *
 * In Baileys the sender identity comes from:
 *  - `key.participant`  — in group chats (the actual sender inside the group)
 *  - `key.remoteJid`    — in private chats (the JID of the other party)
 *
 * Both are JIDs in the form `<phone>@s.whatsapp.net` (or `@g.us` for groups).
 */
export function extractWhatsappSenderPhone(msg: unknown, chatId: string): string | null {
  if (!msg || typeof msg !== 'object') {
    return normalizeWhatsappPhone(chatId.split('@')[0]);
  }

  const record = msg as { key?: { remoteJid?: string; participant?: string } };
  const participant = record.key?.participant;
  const remoteJid = record.key?.remoteJid || chatId;

  const candidate = participant || remoteJid;
  const bare = (candidate || '').split('@')[0] || '';
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
