import { randomUUID } from 'crypto';

export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function resolveRequestId(value: unknown): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' && REQUEST_ID_PATTERN.test(candidate)
    ? candidate
    : randomUUID();
}
