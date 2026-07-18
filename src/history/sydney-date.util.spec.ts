import {
  isSydneyPeakHour,
  sydneyDaysAgo,
  sydneyLocalDate,
  sydneyLocalHour,
} from './sydney-date.util';

describe('sydneyLocalDate', () => {
  it('returns YYYY-MM-DD for a known Sydney instant', () => {
    // 2026-07-18 01:00 UTC = 11:00 AEST (UTC+10 in July)
    expect(sydneyLocalDate(new Date('2026-07-18T01:00:00Z'))).toBe(
      '2026-07-18',
    );
  });

  it('rolls to previous Sydney day near UTC midnight in summer', () => {
    // AEDT UTC+11: 2026-01-15 12:30 UTC = 2026-01-15 23:30 AEDT
    expect(sydneyLocalDate(new Date('2026-01-15T12:30:00Z'))).toBe(
      '2026-01-15',
    );
    // 2026-01-15 13:30 UTC = 2026-01-16 00:30 AEDT
    expect(sydneyLocalDate(new Date('2026-01-15T13:30:00Z'))).toBe(
      '2026-01-16',
    );
  });
});

describe('sydneyDaysAgo', () => {
  it('subtracts calendar days in Sydney space', () => {
    expect(sydneyDaysAgo(0, new Date('2026-07-18T01:00:00Z'))).toBe(
      '2026-07-18',
    );
    expect(sydneyDaysAgo(7, new Date('2026-07-18T01:00:00Z'))).toBe(
      '2026-07-11',
    );
  });
});

describe('isSydneyPeakHour', () => {
  it('marks AM and PM peaks', () => {
    expect(isSydneyPeakHour(7)).toBe(true);
    expect(isSydneyPeakHour(8)).toBe(true);
    expect(isSydneyPeakHour(16)).toBe(true);
    expect(isSydneyPeakHour(12)).toBe(false);
    expect(isSydneyPeakHour(6)).toBe(false);
  });
});

describe('sydneyLocalHour', () => {
  it('returns Sydney local hour', () => {
    // 01:00 UTC in July (AEST+10) → 11
    expect(sydneyLocalHour(new Date('2026-07-18T01:00:00Z'))).toBe(11);
  });
});
