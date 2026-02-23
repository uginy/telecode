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
    it('uses author when present', () => {
      expect(extractWhatsappSenderPhone({ author: '972501112233@c.us' }, 'fallback@c.us')).toBe('972501112233');
    });

    it('falls back to from/chatId', () => {
      expect(extractWhatsappSenderPhone({ from: '+972509998877@c.us' }, 'fallback@c.us')).toBe('972509998877');
      expect(extractWhatsappSenderPhone({}, '972533334444@c.us')).toBe('972533334444');
    });
  });

  describe('isWhatsappSenderAllowed', () => {
    it('allows everyone in all mode', () => {
      expect(
        isWhatsappSenderAllowed({
          mode: 'all',
          allowedPhones: [],
          fromMe: false,
          msg: { from: '111@c.us' },
          chatId: '111@c.us',
        })
      ).toBe(true);
    });

    it('allows only self in self mode', () => {
      expect(
        isWhatsappSenderAllowed({
          mode: 'self',
          allowedPhones: [],
          fromMe: true,
          msg: { from: '111@c.us' },
          chatId: '111@c.us',
        })
      ).toBe(true);
      expect(
        isWhatsappSenderAllowed({
          mode: 'self',
          allowedPhones: [],
          fromMe: false,
          msg: { from: '111@c.us' },
          chatId: '111@c.us',
        })
      ).toBe(false);
    });

    it('allows self in allowlist mode and checks sender for others', () => {
      expect(
        isWhatsappSenderAllowed({
          mode: 'allowlist',
          allowedPhones: [],
          fromMe: true,
          msg: { from: '111@c.us' },
          chatId: '111@c.us',
        })
      ).toBe(true);

      expect(
        isWhatsappSenderAllowed({
          mode: 'allowlist',
          allowedPhones: ['+972501112233'],
          fromMe: false,
          msg: { from: '972501112233@c.us' },
          chatId: '972501112233@c.us',
        })
      ).toBe(true);

      expect(
        isWhatsappSenderAllowed({
          mode: 'allowlist',
          allowedPhones: ['972501112233'],
          fromMe: false,
          msg: { from: '972509998877@c.us' },
          chatId: '972509998877@c.us',
        })
      ).toBe(false);
    });
  });
});
