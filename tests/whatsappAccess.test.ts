import { describe, expect, it } from 'vitest';
import {
  extractWhatsappSenderPhone,
  isWhatsappSenderAllowed,
  normalizeWhatsappPhone,
} from '../src/channels/whatsapp/access';

describe('WhatsApp Access Utils', () => {
  describe('normalizeWhatsappPhone', () => {
    it('normalizes plus-prefixed phone', () => {
      expect(normalizeWhatsappPhone('+972501112233')).toBe('972501112233');
    });

    it('normalizes formatted phone with spaces and symbols', () => {
      expect(normalizeWhatsappPhone('(+972) 50-111-2233')).toBe('972501112233');
    });

    it('returns null for empty/invalid input', () => {
      expect(normalizeWhatsappPhone('abc')).toBeNull();
      expect(normalizeWhatsappPhone('')).toBeNull();
    });

    it('returns null for too short or too long values', () => {
      expect(normalizeWhatsappPhone('123456')).toBeNull();
      expect(normalizeWhatsappPhone('1234567890123456')).toBeNull();
    });
  });

  describe('extractWhatsappSenderPhone', () => {
    it('uses participant when present', () => {
      expect(
        extractWhatsappSenderPhone({ key: { participant: '972501112233@s.whatsapp.net' } }, 'fallback@g.us')
      ).toBe('972501112233');
    });

    it('falls back to remoteJid/chatId', () => {
      expect(
        extractWhatsappSenderPhone({ key: { remoteJid: '+972509998877@s.whatsapp.net' } }, 'fallback@g.us')
      ).toBe('972509998877');
      expect(extractWhatsappSenderPhone({}, '972533334444@s.whatsapp.net')).toBe('972533334444');
    });
  });

  describe('isWhatsappSenderAllowed', () => {
    it('allows everyone in all mode', () => {
      expect(
        isWhatsappSenderAllowed({
          mode: 'all',
          allowedPhones: [],
          fromMe: false,
          msg: { key: { remoteJid: '111@s.whatsapp.net' } },
          chatId: '111@s.whatsapp.net',
        })
      ).toBe(true);
    });

    it('allows only self in self mode', () => {
      expect(
        isWhatsappSenderAllowed({
          mode: 'self',
          allowedPhones: [],
          fromMe: true,
          msg: { key: { remoteJid: '111@s.whatsapp.net' } },
          chatId: '111@s.whatsapp.net',
        })
      ).toBe(true);
      expect(
        isWhatsappSenderAllowed({
          mode: 'self',
          allowedPhones: [],
          fromMe: false,
          msg: { key: { remoteJid: '111@s.whatsapp.net' } },
          chatId: '111@s.whatsapp.net',
        })
      ).toBe(false);
    });

    it('allows self in allowlist mode and checks sender for others', () => {
      expect(
        isWhatsappSenderAllowed({
          mode: 'allowlist',
          allowedPhones: [],
          fromMe: true,
          msg: { key: { remoteJid: '111@s.whatsapp.net' } },
          chatId: '111@s.whatsapp.net',
        })
      ).toBe(true);

      expect(
        isWhatsappSenderAllowed({
          mode: 'allowlist',
          allowedPhones: ['+972501112233'],
          fromMe: false,
          msg: { key: { remoteJid: '972501112233@s.whatsapp.net' } },
          chatId: '972501112233@s.whatsapp.net',
        })
      ).toBe(true);

      expect(
        isWhatsappSenderAllowed({
          mode: 'allowlist',
          allowedPhones: ['972501112233'],
          fromMe: false,
          msg: { key: { remoteJid: '972509998877@s.whatsapp.net' } },
          chatId: '972509998877@s.whatsapp.net',
        })
      ).toBe(false);
    });
  });
});
