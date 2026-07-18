export const SYDNEY_TIMEZONE = 'Australia/Sydney';

/** YYYY-MM-DD in Australia/Sydney. */
export function sydneyLocalDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY_TIMEZONE,
  }).format(at);
}

/** Local hour 0–23 in Australia/Sydney. */
export function sydneyLocalHour(at: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY_TIMEZONE,
    hour: 'numeric',
    hour12: false,
  }).format(at);
  // en-AU can return "24" for midnight in some engines — normalize.
  const parsed = parseInt(hour, 10);
  return parsed === 24 ? 0 : parsed;
}

/** AM peak 7–9 and PM peak 16–18 (inclusive hours). */
export function isSydneyPeakHour(hour: number): boolean {
  return (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18);
}

/**
 * Sydney-local calendar date N days before `at`.
 * Uses calendar arithmetic on the Sydney YYYY-MM-DD string (not UTC setDate).
 */
export function sydneyDaysAgo(days: number, at: Date = new Date()): string {
  const [y, m, d] = sydneyLocalDate(at).split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - days);
  return utc.toISOString().slice(0, 10);
}
