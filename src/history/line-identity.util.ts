/**
 * GTFS route-family → rider-facing line badge (T1…T9, CCN, M1…).
 * Mirrors the Flutter app's lib/core/utils/line_identity.dart — keep in sync.
 */
const FAMILY_TO_LINE: Record<string, string> = {
  NSN: 'T1',
  WST: 'T1',
  NTHW: 'T1',
  IWL: 'T2',
  LEP: 'T2',
  BNK: 'T3',
  LVP: 'T3',
  ESI: 'T4',
  ILL: 'T4',
  CMB: 'T5',
  CAR: 'T6',
  LDB: 'T6',
  OLY: 'T7',
  APS: 'T8',
  NTH: 'T9',
  BMT: 'BMT',
  CCN: 'CCN',
  HUN: 'HUN',
  SCO: 'SCO',
  SHL: 'SHL',
  M1: 'M1',
  SMNW: 'M1',
  MTRO: 'M1',
};

/**
 * Resolves the rider-facing line for a vehicle/trip. Prefers the routeId
 * family (`CCN_1a` → `CCN`); falls back to scanning tripId segments; then
 * to the raw route family; finally 'OTHER'.
 */
export function lineFor(
  routeId?: string | null,
  tripId?: string | null,
): string {
  for (const source of [routeId, tripId]) {
    if (!source) continue;
    for (const segment of source.toUpperCase().split(/[._\-\s]/)) {
      if (FAMILY_TO_LINE[segment]) return FAMILY_TO_LINE[segment];
      const prefix = /^[A-Z]+/.exec(segment)?.[0];
      if (prefix && FAMILY_TO_LINE[prefix]) return FAMILY_TO_LINE[prefix];
    }
  }
  const family = routeId?.toUpperCase().split(/[._\-]/)[0];
  return family && family.length > 0 && family.length <= 6 ? family : 'OTHER';
}
