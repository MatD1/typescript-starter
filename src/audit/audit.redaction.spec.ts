import { BadRequestException } from '@nestjs/common';
import {
  changedFields,
  fingerprintIp,
  networkPrefix,
  redactAuditRecord,
  sanitizeAuditText,
  validateAuditReason,
} from './audit.redaction';

describe('audit redaction', () => {
  it('recursively removes credentials while preserving useful fields', () => {
    expect(
      redactAuditRecord({
        name: 'safe',
        authorization: 'Bearer secret',
        nested: {
          refreshToken: 'secret',
          api_key: 'secret',
          count: 2,
        },
      }),
    ).toEqual({
      name: 'safe',
      authorization: '[REDACTED]',
      nested: {
        refreshToken: '[REDACTED]',
        api_key: '[REDACTED]',
        count: 2,
      },
    });
  });

  it('bounds strings and removes unsafe control characters', () => {
    expect(sanitizeAuditText(`a\u0000b${'x'.repeat(20)}`, 5)).toBe('abxxx');
  });

  it('requires meaningful reasons for high-risk actions', () => {
    expect(validateAuditReason('A legitimate operational reason')).toBe(
      'A legitimate operational reason',
    );
    expect(() => validateAuditReason('short')).toThrow(BadRequestException);
    expect(() => validateAuditReason(undefined)).toThrow(BadRequestException);
  });

  it('computes stable changed fields without recording whole DTOs', () => {
    expect(
      changedFields(
        { role: 'user', banned: false, stable: 1 },
        { role: 'admin', banned: false, stable: 1 },
      ),
    ).toEqual(['role']);
  });

  it('stores a coarse network and keyed fingerprint instead of a raw IP', () => {
    expect(networkPrefix('::ffff:192.168.10.42')).toBe('192.168.10.0/24');
    expect(networkPrefix('2001:db8:1234:5678::1')).toBe('2001:db8:1234::/48');
    expect(fingerprintIp('192.168.10.42', 'secret')).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprintIp('192.168.10.42', 'secret')).not.toContain(
      '192.168.10.42',
    );
  });
});
