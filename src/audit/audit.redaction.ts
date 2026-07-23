import { createHmac } from 'crypto';
import { BadRequestException } from '@nestjs/common';

const SENSITIVE_KEY =
  /(authorization|cookie|password|passwd|secret|token|credential|api.?key|firebase|private.?key|session)/i;
const MAX_DEPTH = 6;
const MAX_ARRAY = 100;
const MAX_STRING = 2000;

function boundedString(value: string, max = MAX_STRING): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
}

export function redactAuditValue(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return boundedString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY)
      .map((entry) => redactAuditValue(entry, depth + 1));
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [rawKey, entry] of Object.entries(
      value as Record<string, unknown>,
    ).slice(0, 100)) {
      const key = boundedString(rawKey, 100);
      result[key] = SENSITIVE_KEY.test(key)
        ? '[REDACTED]'
        : redactAuditValue(entry, depth + 1);
    }
    return result;
  }
  return boundedString(String(value));
}

export function redactAuditRecord(
  value?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!value) return null;
  return redactAuditValue(value) as Record<string, unknown>;
}

export function sanitizeAuditText(
  value: string | undefined,
  maxLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  return boundedString(value.trim(), maxLength);
}

export function validateAuditReason(reason: string | undefined): string {
  const sanitized = sanitizeAuditText(reason, 1000) ?? '';
  if (sanitized.length < 10) {
    throw new BadRequestException(
      'X-Audit-Reason must contain between 10 and 1000 characters',
    );
  }
  return sanitized;
}

export function fingerprintIp(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(ip).digest('hex');
}

export function networkPrefix(ip: string): string {
  const normalized = ip.replace(/^::ffff:/, '');
  const ipv4 = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.0/24`;

  const ipv6 = normalized.split(':');
  if (ipv6.length >= 3) return `${ipv6.slice(0, 3).join(':')}::/48`;
  return 'unknown';
}

export function changedFields(
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
): string[] {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  return [...keys]
    .filter(
      (key) =>
        JSON.stringify(before?.[key] ?? null) !==
        JSON.stringify(after?.[key] ?? null),
    )
    .sort();
}
