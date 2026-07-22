import type {
  ServiceAlert,
  TripUpdate,
  VehiclePosition,
} from '../transport/nsw-gtfs-rt.types';
import {
  disruptionMinutesForEffect,
  isAlertActiveAt,
  isServiceAffectingSeverity,
} from './disruption.util';
import {
  DELAY_THRESHOLD_SECONDS,
  STALE_FEED_THRESHOLD_SECONDS,
} from './history.constants';
import { resolveLine, type RouteMetadata } from './line-identity.util';
import { isCrowdedOccupancy, occupancyScore } from './occupancy.util';
import { percentile } from './percentile.util';
import { isSydneyPeakHour, sydneyLocalHour } from './sydney-date.util';

export interface LineAccumulator {
  mode: string;
  vehicles: number;
  trackedTrips: number;
  delayedTrips: number;
  cancelledTrips: number;
  skippedTrips: number;
  earlyTrips: number;
  delaySum: number;
  delays: number[];
  maxDelay: number;
  occupancyScoreSum: number;
  occupancySamples: number;
  crowdedVehicles: number;
  disruptions: number;
  disruptionMinutes: number;
  disruptionCountByEffect: Record<string, number>;
  scheduledTrips: number;
  peakTrackedTrips: number;
  peakDelayedTrips: number;
  offPeakTrackedTrips: number;
  offPeakDelayedTrips: number;
}

export interface DisruptionEventRow {
  mode: string;
  line: string;
  alertId: string;
  effect: string | null;
  cause: string | null;
}

export interface AggregateSampleInput {
  tripUpdates: Array<TripUpdate & { mode: string }>;
  vehicles: Array<VehiclePosition & { mode: string }>;
  alerts: Array<ServiceAlert & { mode: string }>;
  routeMetadata: Map<string, RouteMetadata>;
  /** stopId → routeIds from GTFS static */
  stopToRouteIds: Map<string, string[]>;
  /** tripId → routeId from GTFS static (fallback when RT omits routeId) */
  tripToRouteId: Map<string, string>;
  /** mode|line → scheduled trip count for today */
  scheduledByLine: Map<string, number>;
  at?: Date;
  /**
   * tripIds already counted as cancelled/skipped earlier today. The sampler
   * runs every 5 minutes and a cancelled trip typically stays in the feed
   * for as long as it would have run — without this, the same distinct
   * cancellation gets counted again on every sample it's present for,
   * wildly inflating "N cancellations" for what's really one incident.
   * Optional — omitting it (e.g. in older callers/tests) just disables
   * dedup, matching the previous behaviour.
   */
  alreadyCountedCancelled?: ReadonlySet<string>;
  alreadyCountedSkipped?: ReadonlySet<string>;
}

export interface AggregateSampleResult {
  byLine: Map<string, LineAccumulator>;
  disruptionEvents: DisruptionEventRow[];
  feedStale: boolean;
  tripUpdateCount: number;
  vehicleCount: number;
  isPeak: boolean;
  /** tripIds newly counted as cancelled/skipped this sample — the caller
   * persists these (merged with the running day's set) so the next sample
   * knows not to recount them. */
  newlyCancelledTripIds: string[];
  newlySkippedTripIds: string[];
}

function emptyAccumulator(mode: string): LineAccumulator {
  return {
    mode,
    vehicles: 0,
    trackedTrips: 0,
    delayedTrips: 0,
    cancelledTrips: 0,
    skippedTrips: 0,
    earlyTrips: 0,
    delaySum: 0,
    delays: [],
    maxDelay: 0,
    occupancyScoreSum: 0,
    occupancySamples: 0,
    crowdedVehicles: 0,
    disruptions: 0,
    disruptionMinutes: 0,
    disruptionCountByEffect: {},
    scheduledTrips: 0,
    peakTrackedTrips: 0,
    peakDelayedTrips: 0,
    offPeakTrackedTrips: 0,
    offPeakDelayedTrips: 0,
  };
}

function tripDelay(tu: TripUpdate): number {
  return (
    tu.delay ??
    tu.stopTimeUpdates?.at(-1)?.departureDelay ??
    tu.stopTimeUpdates?.at(-1)?.arrivalDelay ??
    0
  );
}

function hasSkippedStop(tu: TripUpdate): boolean {
  return (
    tu.stopTimeUpdates?.some(
      (stu) => stu.scheduleRelationship === 'SKIPPED',
    ) ?? false
  );
}

/**
 * Pure aggregation of realtime feeds into per-(mode, line) history metrics.
 * Extracted for unit testing without Nest/DB.
 */
export function aggregateHistorySample(
  input: AggregateSampleInput,
): AggregateSampleResult {
  const at = input.at ?? new Date();
  const atUnix = Math.floor(at.getTime() / 1000);
  const peak = isSydneyPeakHour(sydneyLocalHour(at));
  const byLine = new Map<string, LineAccumulator>();

  const acc = (mode: string, line: string): LineAccumulator => {
    const key = `${mode}|${line}`;
    let entry = byLine.get(key);
    if (!entry) {
      entry = emptyAccumulator(mode);
      entry.scheduledTrips = input.scheduledByLine.get(key) ?? 0;
      byLine.set(key, entry);
    }
    return entry;
  };

  const lineForRoute = (
    routeId?: string | null,
    tripId?: string | null,
  ): string => resolveLine(routeId, tripId, input.routeMetadata);

  // Staleness: newest trip-update timestamp older than threshold → skip write
  let newestTs = 0;
  let anyTs = false;
  for (const tu of input.tripUpdates) {
    if (tu.timestamp != null) {
      anyTs = true;
      if (tu.timestamp > newestTs) newestTs = tu.timestamp;
    }
  }
  const feedStale =
    anyTs && atUnix - newestTs > STALE_FEED_THRESHOLD_SECONDS;

  const alreadyCountedCancelled = input.alreadyCountedCancelled ?? new Set();
  const alreadyCountedSkipped = input.alreadyCountedSkipped ?? new Set();
  const newlyCancelledTripIds: string[] = [];
  const newlySkippedTripIds: string[] = [];

  for (const tu of input.tripUpdates) {
    const entry = acc(tu.mode, lineForRoute(tu.routeId, tu.tripId));
    entry.trackedTrips++;
    if (peak) entry.peakTrackedTrips++;
    else entry.offPeakTrackedTrips++;

    if (tu.scheduleRelationship === 'CANCELED') {
      if (!alreadyCountedCancelled.has(tu.tripId)) {
        entry.cancelledTrips++;
        newlyCancelledTripIds.push(tu.tripId);
      }
      continue;
    }
    if (hasSkippedStop(tu) && !alreadyCountedSkipped.has(tu.tripId)) {
      entry.skippedTrips++;
      newlySkippedTripIds.push(tu.tripId);
    }

    const delay = tripDelay(tu);
    entry.delays.push(delay);
    entry.delaySum += Math.max(0, delay);
    if (delay < 0) entry.earlyTrips++;
    if (delay > DELAY_THRESHOLD_SECONDS) {
      entry.delayedTrips++;
      if (peak) entry.peakDelayedTrips++;
      else entry.offPeakDelayedTrips++;
    }
    if (delay > entry.maxDelay) entry.maxDelay = delay;
  }

  const tripRoute = new Map<string, string>();
  for (const tu of input.tripUpdates) {
    if (tu.routeId) tripRoute.set(tu.tripId, tu.routeId);
  }
  for (const [tripId, routeId] of input.tripToRouteId) {
    if (!tripRoute.has(tripId)) tripRoute.set(tripId, routeId);
  }

  for (const vehicle of input.vehicles) {
    const routeId =
      vehicle.routeId ??
      (vehicle.tripId ? tripRoute.get(vehicle.tripId) : undefined);
    const entry = acc(
      vehicle.mode,
      lineForRoute(routeId, vehicle.tripId),
    );
    entry.vehicles++;
    const score = occupancyScore(vehicle.occupancyStatus);
    if (score != null) {
      entry.occupancyScoreSum += score;
      entry.occupancySamples++;
    }
    if (isCrowdedOccupancy(vehicle.occupancyStatus)) {
      entry.crowdedVehicles++;
    }
  }

  const disruptionEvents: DisruptionEventRow[] = [];

  for (const alert of input.alerts) {
    if (!isServiceAffectingSeverity(alert.severityLevel)) continue;
    if (!isAlertActiveAt(alert, atUnix)) continue;

    const routeIds = new Set<string>();
    for (const entity of alert.informedEntities ?? []) {
      if (entity.routeId) routeIds.add(entity.routeId);
      if (entity.tripId) {
        const fromRt = tripRoute.get(entity.tripId);
        if (fromRt) routeIds.add(fromRt);
        const fromStatic = input.tripToRouteId.get(entity.tripId);
        if (fromStatic) routeIds.add(fromStatic);
      }
      if (entity.stopId) {
        for (const rid of input.stopToRouteIds.get(entity.stopId) ?? []) {
          routeIds.add(rid);
        }
      }
    }

    const lines = new Set<string>();
    for (const routeId of routeIds) {
      lines.add(lineForRoute(routeId));
    }
    if (lines.size === 0) lines.add('NETWORK');

    const effect = alert.effect ?? 'UNKNOWN_EFFECT';
    const minutes = disruptionMinutesForEffect(effect);

    for (const line of lines) {
      const entry = acc(alert.mode, line);
      entry.disruptions++;
      entry.disruptionMinutes += minutes;
      entry.disruptionCountByEffect[effect] =
        (entry.disruptionCountByEffect[effect] ?? 0) + 1;
      disruptionEvents.push({
        mode: alert.mode,
        line,
        alertId: alert.id,
        effect: alert.effect ?? null,
        cause: alert.cause ?? null,
      });
    }
  }

  return {
    byLine,
    disruptionEvents,
    feedStale,
    tripUpdateCount: input.tripUpdates.length,
    vehicleCount: input.vehicles.length,
    isPeak: peak,
    newlyCancelledTripIds,
    newlySkippedTripIds,
  };
}

export function snapshotRowFromAccumulator(
  key: string,
  entry: LineAccumulator,
) {
  const line = key.split('|')[1];
  const trackedForAvg = entry.trackedTrips - entry.cancelledTrips;
  return {
    mode: entry.mode,
    line,
    vehicles: entry.vehicles,
    trackedTrips: entry.trackedTrips,
    delayedTrips: entry.delayedTrips,
    cancelledTrips: entry.cancelledTrips,
    skippedTrips: entry.skippedTrips,
    earlyTrips: entry.earlyTrips,
    avgDelaySeconds:
      trackedForAvg > 0
        ? Math.round(entry.delaySum / trackedForAvg)
        : 0,
    maxDelaySeconds: entry.maxDelay,
    delayP50Seconds: percentile(entry.delays, 50),
    delayP90Seconds: percentile(entry.delays, 90),
    avgOccupancy:
      entry.occupancySamples > 0
        ? Math.round(entry.occupancyScoreSum / entry.occupancySamples)
        : 0,
    crowdedVehicles: entry.crowdedVehicles,
    activeDisruptions: entry.disruptions,
    scheduledTrips: entry.scheduledTrips,
    disruptionMinutes: entry.disruptionMinutes,
    disruptionCountByEffect: { ...entry.disruptionCountByEffect },
    peakTrackedTrips: entry.peakTrackedTrips,
    peakDelayedTrips: entry.peakDelayedTrips,
    offPeakTrackedTrips: entry.offPeakTrackedTrips,
    offPeakDelayedTrips: entry.offPeakDelayedTrips,
    occupancyScoreSum: entry.occupancyScoreSum,
    occupancySamples: entry.occupancySamples,
  };
}
