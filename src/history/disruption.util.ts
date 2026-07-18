import type { ServiceAlert } from '../transport/nsw-gtfs-rt.types';
import { SAMPLE_INTERVAL_MINUTES } from './history.constants';

/** Relative weight applied to the 5-minute sample interval by alert effect. */
export const DISRUPTION_EFFECT_WEIGHT: Record<string, number> = {
  NO_SERVICE: 1,
  SIGNIFICANT_DELAYS: 0.75,
  DETOUR: 0.5,
  REDUCED_SERVICE: 0.5,
  STOP_MOVED: 0.25,
  OTHER_EFFECT: 0.25,
  UNKNOWN_EFFECT: 0.25,
};

export function disruptionMinutesForEffect(effect?: string | null): number {
  const weight = DISRUPTION_EFFECT_WEIGHT[effect ?? ''] ?? 0.5;
  return Math.round(SAMPLE_INTERVAL_MINUTES * weight);
}

/** True when the alert has no periods or at least one period covers `atUnix`. */
export function isAlertActiveAt(
  alert: ServiceAlert,
  atUnix: number,
): boolean {
  if (!alert.activePeriods.length) return true;
  return alert.activePeriods.some((period) => {
    const start = period.start ?? 0;
    const end = period.end ?? Number.MAX_SAFE_INTEGER;
    return atUnix >= start && atUnix <= end;
  });
}

export function isServiceAffectingSeverity(severity?: string | null): boolean {
  return severity === 'WARNING' || severity === 'SEVERE';
}
