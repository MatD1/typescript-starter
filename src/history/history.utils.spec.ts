import {
  disruptionMinutesForEffect,
  isAlertActiveAt,
  isServiceAffectingSeverity,
} from './disruption.util';
import { occupancyScore, isCrowdedOccupancy } from './occupancy.util';
import { percentile } from './percentile.util';

describe('disruption.util', () => {
  it('weights effects relative to the 5-minute interval', () => {
    expect(disruptionMinutesForEffect('NO_SERVICE')).toBe(5);
    expect(disruptionMinutesForEffect('SIGNIFICANT_DELAYS')).toBe(4);
    expect(disruptionMinutesForEffect('DETOUR')).toBe(3);
    expect(disruptionMinutesForEffect('UNKNOWN_EFFECT')).toBe(1);
  });

  it('treats empty activePeriods as always active', () => {
    expect(isAlertActiveAt({ activePeriods: [] } as never, 1000)).toBe(true);
  });

  it('checks period overlap', () => {
    const alert = {
      activePeriods: [{ start: 100, end: 200 }],
    } as never;
    expect(isAlertActiveAt(alert, 150)).toBe(true);
    expect(isAlertActiveAt(alert, 50)).toBe(false);
  });

  it('filters severity', () => {
    expect(isServiceAffectingSeverity('WARNING')).toBe(true);
    expect(isServiceAffectingSeverity('SEVERE')).toBe(true);
    expect(isServiceAffectingSeverity('INFO')).toBe(false);
  });
});

describe('occupancy.util', () => {
  it('maps statuses to scores', () => {
    expect(occupancyScore('EMPTY')).toBe(0);
    expect(occupancyScore('FULL')).toBe(4);
    expect(occupancyScore(undefined)).toBeNull();
  });

  it('detects crowded vehicles', () => {
    expect(isCrowdedOccupancy('STANDING_ROOM_ONLY')).toBe(true);
    expect(isCrowdedOccupancy('MANY_SEATS_AVAILABLE')).toBe(false);
  });
});

describe('percentile', () => {
  it('returns 0 for empty', () => {
    expect(percentile([], 50)).toBe(0);
  });

  it('computes p50 and p90', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 90)).toBe(90);
  });
});
