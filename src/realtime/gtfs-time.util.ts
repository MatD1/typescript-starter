const SYDNEY_TIMEZONE = 'Australia/Sydney';

/** Sydney's UTC offset (in minutes) on the day of `utcGuess` — +600 (AEST) or +660 (AEDT). */
function sydneyOffsetMinutes(utcGuess: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SYDNEY_TIMEZONE,
    timeZoneName: 'shortOffset',
  }).formatToParts(utcGuess);
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+10';
  const match = /GMT([+-]\d+)/.exec(tzName);
  return match ? parseInt(match[1], 10) * 60 : 600;
}

/**
 * Converts a GTFS static `HH:MM:SS` stop time (which may exceed 24:00:00 for
 * trips running past midnight) plus a `YYYYMMDD` service date into epoch
 * seconds — matching the format GTFS-RT `stop_time_update` entries already
 * use, so scheduled and live stop times can sit in the same list.
 */
export function gtfsScheduledEpochSeconds(
  startDateCompact: string,
  hhmmss: string,
): number | undefined {
  const timeParts = hhmmss.split(':').map(Number);
  if (timeParts.length !== 3 || timeParts.some(Number.isNaN)) return undefined;
  const [h, m, s] = timeParts;

  const year = Number(startDateCompact.substring(0, 4));
  const month = Number(startDateCompact.substring(4, 6));
  const day = Number(startDateCompact.substring(6, 8));
  if (!year || !month || !day) return undefined;

  // Date.UTC normalizes hour overflow (e.g. h=25) into the next calendar day.
  const utcGuess = Date.UTC(year, month - 1, day, h, m, s);
  const offsetMinutes = sydneyOffsetMinutes(new Date(utcGuess));
  return Math.floor((utcGuess - offsetMinutes * 60_000) / 1000);
}
