import { aggregateHistorySample } from './history-aggregate.util';
import { STALE_FEED_THRESHOLD_SECONDS } from './history.constants';
import type { ServiceAlert } from '../transport/nsw-gtfs-rt.types';

function baseAlert(
  overrides: Partial<ServiceAlert> & { mode: string },
): ServiceAlert & { mode: string } {
  return {
    id: 'a1',
    severityLevel: 'WARNING',
    effect: 'SIGNIFICANT_DELAYS',
    activePeriods: [],
    informedEntities: [{ routeId: 'NSN_1' }],
    ...overrides,
  };
}

describe('aggregateHistorySample', () => {
  const emptyMeta = new Map();
  const emptyStops = new Map<string, string[]>();
  const emptyTrips = new Map<string, string>();
  const emptyScheduled = new Map<string, number>();

  it('counts delays above the 5-minute TfNSW threshold', () => {
    const result = aggregateHistorySample({
      tripUpdates: [
        {
          tripId: 't1',
          routeId: 'NSN_1',
          mode: 'sydneytrains',
          delay: 301,
          stopTimeUpdates: [],
        },
        {
          tripId: 't2',
          routeId: 'NSN_1',
          mode: 'sydneytrains',
          delay: 60,
          stopTimeUpdates: [],
        },
      ],
      vehicles: [],
      alerts: [],
      routeMetadata: emptyMeta,
      stopToRouteIds: emptyStops,
      tripToRouteId: emptyTrips,
      scheduledByLine: emptyScheduled,
      at: new Date('2026-07-18T01:00:00Z'), // Sydney peak ~11am AEST mid-winter? Jul is AEST UTC+10 → 11:00 peak
    });

    const entry = result.byLine.get('sydneytrains|T1')!;
    expect(entry.trackedTrips).toBe(2);
    expect(entry.delayedTrips).toBe(1);
    expect(entry.maxDelay).toBe(301);
  });

  it('counts cancellations and skips delay math for them', () => {
    const result = aggregateHistorySample({
      tripUpdates: [
        {
          tripId: 't1',
          routeId: 'CCN_1',
          mode: 'sydneytrains',
          scheduleRelationship: 'CANCELED',
          delay: 9999,
          stopTimeUpdates: [],
        },
      ],
      vehicles: [],
      alerts: [],
      routeMetadata: emptyMeta,
      stopToRouteIds: emptyStops,
      tripToRouteId: emptyTrips,
      scheduledByLine: emptyScheduled,
    });

    const entry = result.byLine.get('sydneytrains|CCN')!;
    expect(entry.cancelledTrips).toBe(1);
    expect(entry.delayedTrips).toBe(0);
    expect(entry.maxDelay).toBe(0);
    expect(result.newlyCancelledTripIds).toEqual(['t1']);
  });

  it('does not recount a cancelled trip already seen in an earlier sample today', () => {
    const result = aggregateHistorySample({
      tripUpdates: [
        {
          tripId: 't1',
          routeId: 'CCN_1',
          mode: 'sydneytrains',
          scheduleRelationship: 'CANCELED',
          stopTimeUpdates: [],
        },
        {
          tripId: 't2',
          routeId: 'CCN_1',
          mode: 'sydneytrains',
          scheduleRelationship: 'CANCELED',
          stopTimeUpdates: [],
        },
      ],
      vehicles: [],
      alerts: [],
      routeMetadata: emptyMeta,
      stopToRouteIds: emptyStops,
      tripToRouteId: emptyTrips,
      scheduledByLine: emptyScheduled,
      alreadyCountedCancelled: new Set(['t1']),
    });

    const entry = result.byLine.get('sydneytrains|CCN')!;
    // t1 was already counted in an earlier 5-minute sample today (it's still
    // sitting in the feed) — only t2 is a genuinely new cancellation.
    expect(entry.cancelledTrips).toBe(1);
    expect(result.newlyCancelledTripIds).toEqual(['t2']);
  });

  it('does not recount a skipped-stop trip already seen in an earlier sample today', () => {
    const result = aggregateHistorySample({
      tripUpdates: [
        {
          tripId: 's1',
          routeId: 'NSN_1',
          mode: 'sydneytrains',
          delay: 0,
          stopTimeUpdates: [{ scheduleRelationship: 'SKIPPED' }],
        },
      ],
      vehicles: [],
      alerts: [],
      routeMetadata: emptyMeta,
      stopToRouteIds: emptyStops,
      tripToRouteId: emptyTrips,
      scheduledByLine: emptyScheduled,
      alreadyCountedSkipped: new Set(['s1']),
    });

    const entry = result.byLine.get('sydneytrains|T1')!;
    expect(entry.skippedTrips).toBe(0);
    expect(result.newlySkippedTripIds).toEqual([]);
  });

  it('resolves vehicle routeId via trip-update map', () => {
    const result = aggregateHistorySample({
      tripUpdates: [
        {
          tripId: 'trip-x',
          routeId: 'APS_1',
          mode: 'sydneytrains',
          delay: 0,
          stopTimeUpdates: [],
        },
      ],
      vehicles: [
        {
          vehicleId: 'v1',
          tripId: 'trip-x',
          latitude: -33.8,
          longitude: 151.2,
          mode: 'sydneytrains',
        },
      ],
      alerts: [],
      routeMetadata: emptyMeta,
      stopToRouteIds: emptyStops,
      tripToRouteId: emptyTrips,
      scheduledByLine: emptyScheduled,
    });

    expect(result.byLine.get('sydneytrains|T8')!.vehicles).toBe(1);
  });

  it('counts early trips and skipped stops', () => {
    const result = aggregateHistorySample({
      tripUpdates: [
        {
          tripId: 't1',
          routeId: 'NSN_1',
          mode: 'sydneytrains',
          delay: -120,
          stopTimeUpdates: [
            { stopId: 'S1', scheduleRelationship: 'SKIPPED' },
          ],
        },
      ],
      vehicles: [],
      alerts: [],
      routeMetadata: emptyMeta,
      stopToRouteIds: emptyStops,
      tripToRouteId: emptyTrips,
      scheduledByLine: emptyScheduled,
    });

    const entry = result.byLine.get('sydneytrains|T1')!;
    expect(entry.earlyTrips).toBe(1);
    expect(entry.skippedTrips).toBe(1);
  });

  it('ignores INFO severity and inactive alerts', () => {
    const now = Math.floor(Date.now() / 1000);
    const result = aggregateHistorySample({
      tripUpdates: [],
      vehicles: [],
      alerts: [
        baseAlert({
          mode: 'sydneytrains',
          severityLevel: 'INFO',
          id: 'info',
        }),
        baseAlert({
          mode: 'sydneytrains',
          id: 'expired',
          activePeriods: [{ start: now - 10_000, end: now - 5000 }],
        }),
        baseAlert({
          mode: 'sydneytrains',
          id: 'active',
          effect: 'NO_SERVICE',
          activePeriods: [{ start: now - 100, end: now + 1000 }],
        }),
      ],
      routeMetadata: emptyMeta,
      stopToRouteIds: emptyStops,
      tripToRouteId: emptyTrips,
      scheduledByLine: emptyScheduled,
    });

    const entry = result.byLine.get('sydneytrains|T1')!;
    expect(entry.disruptions).toBe(1);
    expect(entry.disruptionMinutes).toBe(5); // NO_SERVICE weight 1.0 × 5
    expect(entry.disruptionCountByEffect.NO_SERVICE).toBe(1);
    expect(result.disruptionEvents).toHaveLength(1);
  });

  it('resolves alert lines via stopId → route map', () => {
    const result = aggregateHistorySample({
      tripUpdates: [],
      vehicles: [],
      alerts: [
        baseAlert({
          mode: 'buses',
          id: 'bus-alert',
          informedEntities: [{ stopId: 'stop-1' }],
        }),
      ],
      routeMetadata: new Map([
        ['route-370', { lineCode: '370' }],
      ]),
      stopToRouteIds: new Map([['stop-1', ['route-370']]]),
      tripToRouteId: emptyTrips,
      scheduledByLine: emptyScheduled,
    });

    expect(result.byLine.has('buses|370')).toBe(true);
    expect(result.byLine.get('buses|370')!.disruptions).toBe(1);
  });

  it('flags stale feeds when newest trip timestamp is too old', () => {
    const at = new Date('2026-07-18T12:00:00Z');
    const oldTs =
      Math.floor(at.getTime() / 1000) - STALE_FEED_THRESHOLD_SECONDS - 1;
    const result = aggregateHistorySample({
      tripUpdates: [
        {
          tripId: 't1',
          routeId: 'NSN_1',
          mode: 'sydneytrains',
          delay: 0,
          timestamp: oldTs,
          stopTimeUpdates: [],
        },
      ],
      vehicles: [],
      alerts: [],
      routeMetadata: emptyMeta,
      stopToRouteIds: emptyStops,
      tripToRouteId: emptyTrips,
      scheduledByLine: emptyScheduled,
      at,
    });

    expect(result.feedStale).toBe(true);
  });

  it('uses GTFS lineCode for bus routes', () => {
    const result = aggregateHistorySample({
      tripUpdates: [
        {
          tripId: 'b1',
          routeId: '24549_87001',
          mode: 'buses',
          delay: 0,
          stopTimeUpdates: [],
        },
      ],
      vehicles: [],
      alerts: [],
      routeMetadata: new Map([
        ['24549_87001', { lineCode: '370' }],
      ]),
      stopToRouteIds: emptyStops,
      tripToRouteId: emptyTrips,
      scheduledByLine: new Map([['buses|370', 42]]),
    });

    const entry = result.byLine.get('buses|370')!;
    expect(entry.trackedTrips).toBe(1);
    expect(entry.scheduledTrips).toBe(42);
  });
});
