import { createHash, createHmac, timingSafeEqual } from 'crypto';

export function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function signCanonical(value: object, secret: string): string {
  return createHmac('sha256', secret)
    .update(canonicalJson(value))
    .digest('hex');
}

export function verifyCanonicalSignature(
  value: object,
  signature: string,
  secret: string,
): boolean {
  const expected = Buffer.from(signCanonical(value, secret), 'hex');
  const supplied = Buffer.from(signature, 'hex');
  return (
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  );
}
