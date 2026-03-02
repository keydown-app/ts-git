import { describe, it, expect } from 'vitest';
import {
  sha1,
  sha1String,
  isValidOid,
  shortenOid,
  oidsEqual,
} from '../../core/hash.js';

describe('hash', () => {
  describe('sha1', () => {
    it('should hash a string', async () => {
      const result = await sha1('hello world');
      expect(result.oid).toBe('2aae6c35c94fcfb415dbe95f408b9ce91ee846ed');
      expect(result.algorithm).toBe('sha1');
    });

    it('should hash a Uint8Array', async () => {
      const data = new TextEncoder().encode('hello world');
      const result = await sha1(data);
      expect(result.oid).toBe('2aae6c35c94fcfb415dbe95f408b9ce91ee846ed');
    });

    it('should produce consistent hashes', async () => {
      const result1 = await sha1('test');
      const result2 = await sha1('test');
      expect(result1.oid).toBe(result2.oid);
    });
  });

  describe('sha1String', () => {
    it('should return just the oid', async () => {
      const oid = await sha1String('hello world');
      expect(oid).toBe('2aae6c35c94fcfb415dbe95f408b9ce91ee846ed');
    });
  });

  describe('isValidOid', () => {
    it('should validate 40-char hex strings', () => {
      expect(isValidOid('2aae6c35c94fcfb415dbe95f408b9ce91ee846ed')).toBe(true);
      expect(
        isValidOid('2aae6c35c94fcfb415dbe95f408b9ce91ee846ed'.toUpperCase()),
      ).toBe(true);
      expect(isValidOid('2aae6c35c94fcfb415dbe95f408b9ce91ee846e')).toBe(false);
      expect(isValidOid('2aae6c35c94fcfb415dbe95f408b9ce91ee846ed00')).toBe(
        false,
      );
      expect(isValidOid('not-a-oid')).toBe(false);
    });
  });

  describe('shortenOid', () => {
    it('should shorten oids', () => {
      const oid = '2aae6c35c94fcfb415dbe95f408b9ce91ee846ed';
      expect(shortenOid(oid, 7)).toBe('2aae6c3');
      expect(shortenOid(oid, 10)).toBe('2aae6c35c9');
      expect(shortenOid(oid, 40)).toBe(oid);
    });

    it('should return invalid oids unchanged', () => {
      expect(shortenOid('invalid')).toBe('invalid');
    });
  });

  describe('oidsEqual', () => {
    it('should compare oids case-insensitively', () => {
      const oid1 = '2aae6c35c94fcfb415dbe95f408b9ce91ee846ed';
      const oid2 = '2AAE6C35C94FCFB415DBE95F408B9CE91EE846ED';

      expect(oidsEqual(oid1, oid2)).toBe(true);
      expect(oidsEqual(oid1, oid1)).toBe(true);
      expect(oidsEqual(oid1, 'differentoid1234567890123456789012')).toBe(false);
    });
  });
});
