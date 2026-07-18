/**
 * GTFS route-family → rider-facing line badge (T1…T9, CCN, M1…).
 * Canonical shared map: line-identity.map.json (also mirrored in Flutter
 * lib/core/utils/line_identity.dart — keep all three in sync).
 */
import familyMap from './line-identity.map.json';

const FAMILY_TO_LINE: Record<string, string> = Object.fromEntries(
  Object.entries(familyMap).filter(([k]) => !k.startsWith('_')),
) as Record<string, string>;


export type RouteMetadata = {
  lineCode: string;
  routeColour?: string;
  routeName?: string;
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

/**
 * Resolves a line badge, preferring GTFS static route_short_name when available.
 */
export function resolveLine(
  routeId: string | undefined | null,
  tripId: string | undefined | null,
  routeMetadata?: Map<string, RouteMetadata>,
): string {
  if (routeId && routeMetadata?.has(routeId)) {
    const code = routeMetadata.get(routeId)!.lineCode?.trim();
    if (code) return code.toUpperCase();
  }
  return lineFor(routeId, tripId);
}

export { FAMILY_TO_LINE };
