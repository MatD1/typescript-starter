/** GTFS-RT occupancy → 0–4 score for averaging. */
const OCCUPANCY_SCORE: Record<string, number> = {
  EMPTY: 0,
  MANY_SEATS_AVAILABLE: 1,
  FEW_SEATS_AVAILABLE: 2,
  STANDING_ROOM_ONLY: 3,
  CRUSHED_STANDING_ROOM_ONLY: 4,
  FULL: 4,
  NOT_ACCEPTING_PASSENGERS: 4,
};

const CROWDED_STATUSES = new Set([
  'STANDING_ROOM_ONLY',
  'CRUSHED_STANDING_ROOM_ONLY',
  'FULL',
  'NOT_ACCEPTING_PASSENGERS',
]);

export function occupancyScore(status?: string | null): number | null {
  if (!status) return null;
  const score = OCCUPANCY_SCORE[status];
  return score === undefined ? null : score;
}

export function isCrowdedOccupancy(status?: string | null): boolean {
  return status != null && CROWDED_STATUSES.has(status);
}
