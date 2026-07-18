import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, gte, lte, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../database/database.module';
import {
  linePerformanceDaily,
  networkSnapshots,
} from '../database/schema/history.schema';
import { SAMPLE_INTERVAL_MINUTES } from './history.constants';
import { sydneyLocalDate } from './sydney-date.util';

/**
 * Rebuilds daily rollups from retained network_snapshots when aggregation
 * logic changes. Only covers the snapshot retention window (~30 days).
 */
@Injectable()
export class HistoryBackfillService {
  private readonly logger = new Logger(HistoryBackfillService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async backfillFromSnapshots(options?: {
    from?: string;
    to?: string;
  }): Promise<{ daysRebuilt: number; rowsUpserted: number }> {
    const conditions = [];
    if (options?.from) {
      conditions.push(
        gte(networkSnapshots.capturedAt, new Date(`${options.from}T00:00:00+10:00`)),
      );
    }
    if (options?.to) {
      conditions.push(
        lte(networkSnapshots.capturedAt, new Date(`${options.to}T23:59:59+10:00`)),
      );
    }

    const snapshots = await this.db
      .select()
      .from(networkSnapshots)
      .where(conditions.length ? and(...conditions) : undefined);

    // Group by Sydney day + mode + line
    type Agg = {
      samples: number;
      trackedTrips: number;
      delayedTrips: number;
      cancelledTrips: number;
      skippedTrips: number;
      earlyTrips: number;
      delaySecondsSum: number;
      maxDelaySeconds: number;
      delayP50Sum: number;
      delayP90Sum: number;
      occupancyScoreSum: number;
      occupancySamples: number;
      crowdedVehicleSamples: number;
      disruptionMinutes: number;
      scheduledTrips: number;
    };

    const buckets = new Map<string, Agg>();

    for (const snap of snapshots) {
      const day = sydneyLocalDate(new Date(snap.capturedAt));
      const key = `${day}|${snap.mode}|${snap.line}`;
      let agg = buckets.get(key);
      if (!agg) {
        agg = {
          samples: 0,
          trackedTrips: 0,
          delayedTrips: 0,
          cancelledTrips: 0,
          skippedTrips: 0,
          earlyTrips: 0,
          delaySecondsSum: 0,
          maxDelaySeconds: 0,
          delayP50Sum: 0,
          delayP90Sum: 0,
          occupancyScoreSum: 0,
          occupancySamples: 0,
          crowdedVehicleSamples: 0,
          disruptionMinutes: 0,
          scheduledTrips: 0,
        };
        buckets.set(key, agg);
      }
      agg.samples++;
      agg.trackedTrips += snap.trackedTrips;
      agg.delayedTrips += snap.delayedTrips;
      agg.cancelledTrips += snap.cancelledTrips;
      agg.skippedTrips += snap.skippedTrips;
      agg.earlyTrips += snap.earlyTrips;
      const active = Math.max(0, snap.trackedTrips - snap.cancelledTrips);
      agg.delaySecondsSum += snap.avgDelaySeconds * active;
      agg.maxDelaySeconds = Math.max(agg.maxDelaySeconds, snap.maxDelaySeconds);
      agg.delayP50Sum += snap.delayP50Seconds;
      agg.delayP90Sum += snap.delayP90Seconds;
      if (snap.avgOccupancy > 0 || snap.crowdedVehicles > 0) {
        // Reconstruct approximate occupancy samples from snapshot averages
        agg.occupancyScoreSum += snap.avgOccupancy * snap.vehicles;
        agg.occupancySamples += snap.vehicles;
      }
      agg.crowdedVehicleSamples += snap.crowdedVehicles;
      agg.disruptionMinutes +=
        snap.activeDisruptions > 0 ? SAMPLE_INTERVAL_MINUTES : 0;
      agg.scheduledTrips = Math.max(agg.scheduledTrips, snap.scheduledTrips);
    }

    let rowsUpserted = 0;
    for (const [key, agg] of buckets) {
      const [day, mode, line] = key.split('|');
      await this.db
        .insert(linePerformanceDaily)
        .values({
          day,
          mode,
          line,
          samples: agg.samples,
          trackedTrips: agg.trackedTrips,
          delayedTrips: agg.delayedTrips,
          cancelledTrips: agg.cancelledTrips,
          skippedTrips: agg.skippedTrips,
          earlyTrips: agg.earlyTrips,
          delaySecondsSum: agg.delaySecondsSum,
          maxDelaySeconds: agg.maxDelaySeconds,
          delayP50Sum: agg.delayP50Sum,
          delayP90Sum: agg.delayP90Sum,
          occupancyScoreSum: agg.occupancyScoreSum,
          occupancySamples: agg.occupancySamples,
          crowdedVehicleSamples: agg.crowdedVehicleSamples,
          peakTrackedTrips: 0,
          peakDelayedTrips: 0,
          offPeakTrackedTrips: 0,
          offPeakDelayedTrips: 0,
          disruptionMinutes: agg.disruptionMinutes,
          disruptionCountByEffect: {},
          scheduledTrips: agg.scheduledTrips,
        })
        .onConflictDoUpdate({
          target: [
            linePerformanceDaily.day,
            linePerformanceDaily.mode,
            linePerformanceDaily.line,
          ],
          set: {
            samples: agg.samples,
            trackedTrips: agg.trackedTrips,
            delayedTrips: agg.delayedTrips,
            cancelledTrips: agg.cancelledTrips,
            skippedTrips: agg.skippedTrips,
            earlyTrips: agg.earlyTrips,
            delaySecondsSum: agg.delaySecondsSum,
            maxDelaySeconds: agg.maxDelaySeconds,
            delayP50Sum: agg.delayP50Sum,
            delayP90Sum: agg.delayP90Sum,
            occupancyScoreSum: agg.occupancyScoreSum,
            occupancySamples: agg.occupancySamples,
            crowdedVehicleSamples: agg.crowdedVehicleSamples,
            disruptionMinutes: agg.disruptionMinutes,
            scheduledTrips: agg.scheduledTrips,
          },
        });
      rowsUpserted++;
    }

    const daysRebuilt = new Set(
      [...buckets.keys()].map((k) => k.split('|')[0]),
    ).size;

    this.logger.log(
      `Backfill complete: ${rowsUpserted} daily rows across ${daysRebuilt} days from ${snapshots.length} snapshots`,
    );

    try {
      await this.db.execute(
        sql`REFRESH MATERIALIZED VIEW CONCURRENTLY network_performance_daily_mv`,
      );
    } catch (err) {
      this.logger.warn(
        `MV refresh after backfill failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { daysRebuilt, rowsUpserted };
  }
}
