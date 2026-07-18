/**
 * Postgres rejects INSERT…ON CONFLICT when the same conflict key appears twice
 * in one VALUES list ("cannot affect row a second time"). Keep last occurrence.
 */
export function dedupeByKey<T>(
  rows: T[],
  keyFn: (row: T) => string,
): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    map.set(key, row);
  }
  return [...map.values()];
}

export function formatIngestError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts = [err.message];
  let cur: unknown = err;
  for (let i = 0; i < 4; i++) {
    const cause = (cur as { cause?: unknown })?.cause;
    if (!cause || !(cause instanceof Error)) break;
    if (cause.message && !parts.includes(cause.message)) {
      parts.push(cause.message);
    }
    const detail = (cause as { detail?: string }).detail;
    if (detail && !parts.includes(detail)) parts.push(detail);
    cur = cause;
  }
  return parts[parts.length - 1] ?? err.message;
}

export function parseOptionalFloat(value?: string): number | null {
  if (!value) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export function parseOptionalInt(value?: string): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

/** Strip UTF-8 BOM that TfNSW often prefixes on GTFS CSV files. */
export function stripUtf8Bom(buf: Buffer): Buffer {
  if (
    buf.length >= 3 &&
    buf[0] === 0xef &&
    buf[1] === 0xbb &&
    buf[2] === 0xbf
  ) {
    return buf.subarray(3);
  }
  return buf;
}

/** Normalize CSV header names (BOM / whitespace / case). */
export function normalizeCsvHeader(header: string): string {
  return header.replace(/^\uFEFF/, '').trim();
}

/**
 * Read a GTFS field, tolerating BOM-prefixed or oddly cased headers
 * (e.g. `\ufeffstop_id` from TfNSW metro feeds).
 */
export function csvField(
  record: Record<string, string>,
  name: string,
): string {
  if (record[name] != null && record[name] !== '') return record[name];
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(record)) {
    if (normalizeCsvHeader(key).toLowerCase() === lower) {
      return value ?? '';
    }
  }
  return '';
}
