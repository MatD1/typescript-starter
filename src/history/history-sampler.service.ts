import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { sql } from 'drizzle-orm';
import { CacheService } from '../cache/cache.service';
import { DRIZZLE, DrizzleDB } from '../database/database.module';
import {
  disruptionEvents,
  linePerformanceDaily,
  networkSnapshots,
} from '../database/schema/history.schema';
import { DisruptionsService } from '../disruptions/disruptions.service';
import { GtfsStaticService } from '../gtfs-static/gtfs-static.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  aggregateHistorySample,
  snapshotRowFromAccumulator,
} from './history-aggregate.util';
import {
  SAMPLE_INTERVAL_MINUTES,
  SAMPLER_LOCK_KEY,
  SAMPLER_LOCK_TTL_SECONDS,
  SAMPLER_METRICS_KEY,
  SNAPSHOT_RETENTION_DAYS,
} from './history.constants';
import { sydneyLocalDate } from './sydney-date.util';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';

/** Redis key prefix for the running set of tripIds already counted as
 * cancelled/skipped today — see `aggregateHistorySample`'s dedup contract. */
const DEDUP_CANCELLED_KEY_PREFIX = 'history:dedup:cancelled:';
const DEDUP_SKIPPED_KEY_PREFIX = 'history:dedup:skipped:';
/** A little over a day, so the set survives right up to the next Sydney
 * calendar day before a fresh one starts. */
const DEDUP_TTL_SECONDS = 26 * 60 * 60;

export interface SamplerMetrics {
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastSampleDurationMs: number | null;
  lastLineCount: number | null;
  lastTripUpdateCount: number | null;
  consecutiveFailures: number;
  successCount: number;
  failureCount: number;
}

/**
 * Samples the (already cached) realtime feeds every 5 minutes and persists
 * per-line performance history. Reads go through RealtimeService /
 * DisruptionsService, so no additional TfNSW API load beyond normal cache
 * refreshes. Disable with HISTORY_SAMPLER_DISABLED=true (e.g. on serverless
 * deployments where cron does not run anyway).
 */
@Injectable()
export class HistorySamplerService {
  private readonly logger = new Logger(HistorySamplerService.name);
  private readonly disabled =
    process.env.HISTORY_SAMPLER_DISABLED === 'true';

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly realtimeService: RealtimeService,
    private readonly disruptionsService: DisruptionsService,
    private readonly gtfsStaticService: GtfsStaticService,
    private readonly cache: CacheService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  @Cron('*/5 * * * *')
  async sample(): Promise<void> {
    if (this.disabled) return;

    const locked = await this.cache.acquireLock(
      SAMPLER_LOCK_KEY,
      SAMPLER_LOCK_TTL_SECONDS,
    );
    if (!locked) {
      this.logger.debug('History sampler lock held — skipping (another replica)');
      return;
    }

    const started = Date.now();
    try {
      const at = new Date();
      const [tripUpdates, vehicles, alerts, routeMetadata, scheduledByLine] =
        await Promise.all([
          this.realtimeService.getTripUpdates(),
          this.realtimeService.getVehiclePositions(),
          this.disruptionsService.getDisruptions(),
          this.gtfsStaticService.getRouteMetadataMap(),
          this.gtfsStaticService.getScheduledTripCountsByLine(at),
        ]);

      const stopIds = alerts.flatMap((a) =>
        (a.informedEntities ?? [])
          .map((e) => e.stopId)
          .filter((id): id is string => Boolean(id)),
      );
      const tripIdsForStatic = [
        ...vehicles.filter((v) => !v.routeId && v.tripId).map((v) => v.tripId!),
        ...alerts.flatMap((a) =>
          (a.informedEntities ?? [])
            .map((e) => e.tripId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      const [stopToRouteIds, tripToRouteId] = await Promise.all([
        this.gtfsStaticService.getRouteIdsForStopIds(stopIds),
        this.gtfsStaticService.getRouteIdsForTripIds(tripIdsForStatic),
      ]);

      const day = sydneyLocalDate(at);
      const [cancelledSeen, skippedSeen] = await Promise.all([
        this.cache.get<string[]>(DEDUP_CANCELLED_KEY_PREFIX + day),
        this.cache.get<string[]>(DEDUP_SKIPPED_KEY_PREFIX + day),
      ]);
      const alreadyCountedCancelled = new Set(cancelledSeen ?? []);
      const alreadyCountedSkipped = new Set(skippedSeen ?? []);

      const aggregated = aggregateHistorySample({
        tripUpdates,
        vehicles,
        alerts,
        routeMetadata,
        stopToRouteIds,
        tripToRouteId,
        scheduledByLine,
        at,
        alreadyCountedCancelled,
        alreadyCountedSkipped,
      });

      if (aggregated.feedStale) {
        this.logger.warn(
          'History sample skipped — trip update feed is stale (>10 min)',
        );
        await this.recordMetrics({
          success: false,
          durationMs: Date.now() - started,
          lineCount: 0,
          tripUpdateCount: aggregated.tripUpdateCount,
          reason: 'stale_feed',
        });
        return;
      }

      if (aggregated.byLine.size === 0) {
        this.logger.warn('History sample collected no data — skipping write');
        await this.recordMetrics({
          success: false,
          durationMs: Date.now() - started,
          lineCount: 0,
          tripUpdateCount: aggregated.tripUpdateCount,
          reason: 'empty',
        });
        return;
      }

      await this.persist(aggregated, at);

      if (aggregated.newlyCancelledTripIds.length > 0) {
        await this.cache.set(
          DEDUP_CANCELLED_KEY_PREFIX + day,
          [...alreadyCountedCancelled, ...aggregated.newlyCancelledTripIds],
          DEDUP_TTL_SECONDS,
        );
      }
      if (aggregated.newlySkippedTripIds.length > 0) {
        await this.cache.set(
          DEDUP_SKIPPED_KEY_PREFIX + day,
          [...alreadyCountedSkipped, ...aggregated.newlySkippedTripIds],
          DEDUP_TTL_SECONDS,
        );
      }

      const durationMs = Date.now() - started;
      this.logger.log(
        `History sample stored for ${aggregated.byLine.size} lines in ${durationMs}ms (trips=${aggregated.tripUpdateCount}, vehicles=${aggregated.vehicleCount}` +
          `${aggregated.newlyCancelledTripIds.length ? `, newCancellations=${aggregated.newlyCancelledTripIds.join(',')}` : ''})`,
      );
      await this.recordMetrics({
        success: true,
        durationMs,
        lineCount: aggregated.byLine.size,
        tripUpdateCount: aggregated.tripUpdateCount,
      });
      await this.audit?.recordBestEffort({
        category: 'history',
        action: AUDIT_ACTIONS.HISTORY_SAMPLE_COMPLETED,
        outcome: 'succeeded',
        source: 'job',
        actor: { type: 'system', id: 'history-sampler' },
        targetType: 'history_sample',
        targetId: at.toISOString(),
        metadata: {
          durationMs,
          lineCount: aggregated.byLine.size,
          tripUpdateCount: aggregated.tripUpdateCount,
          vehicleCount: aggregated.vehicleCount,
        },
      });
    } catch (error) {
      this.logger.error(
        `History sampling failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.recordMetrics({
        success: false,
        durationMs: Date.now() - started,
        lineCount: null,
        tripUpdateCount: null,
        reason: 'error',
      });
      await this.audit?.recordBestEffort({
        category: 'history',
        action: AUDIT_ACTIONS.HISTORY_SAMPLE_FAILED,
        outcome: 'failed',
        severity: 'warning',
        source: 'job',
        actor: { type: 'system', id: 'history-sampler' },
        targetType: 'history_sample',
        error: {
          code: 'HISTORY_SAMPLE_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async persist(
    aggregated: ReturnType<typeof aggregateHistorySample>,
    at: Date,
  ): Promise<void> {
    const day = sydneyLocalDate(at);
    const rows = [...aggregated.byLine.entries()].map(([key, entry]) =>
      snapshotRowFromAccumulator(key, entry),
    );

    await this.db.transaction(async (tx) => {
      await tx.insert(networkSnapshots).values(
        rows.map((row) => ({
          capturedAt: at,
          mode: row.mode,
          line: row.line,
          vehicles: row.vehicles,
          trackedTrips: row.trackedTrips,
          delayedTrips: row.delayedTrips,
          cancelledTrips: row.cancelledTrips,
          skippedTrips: row.skippedTrips,
          earlyTrips: row.earlyTrips,
          avgDelaySeconds: row.avgDelaySeconds,
          maxDelaySeconds: row.maxDelaySeconds,
          delayP50Seconds: row.delayP50Seconds,
          delayP90Seconds: row.delayP90Seconds,
          avgOccupancy: row.avgOccupancy,
          crowdedVehicles: row.crowdedVehicles,
          activeDisruptions: row.activeDisruptions,
          scheduledTrips: row.scheduledTrips,
        })),
      );

      if (aggregated.disruptionEvents.length > 0) {
        await tx.insert(disruptionEvents).values(
          aggregated.disruptionEvents.map((e) => ({
            capturedAt: at,
            mode: e.mode,
            line: e.line,
            alertId: e.alertId,
            effect: e.effect,
            cause: e.cause,
          })),
        );
      }

      // Chunked upserts — multi-row with EXCLUDED for scalar counters
      const chunkSize = 50;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await tx
          .insert(linePerformanceDaily)
          .values(
            chunk.map((row) => ({
              day,
              mode: row.mode,
              line: row.line,
              samples: 1,
              trackedTrips: row.trackedTrips,
              delayedTrips: row.delayedTrips,
              cancelledTrips: row.cancelledTrips,
              skippedTrips: row.skippedTrips,
              earlyTrips: row.earlyTrips,
              delaySecondsSum: row.avgDelaySeconds * Math.max(0, row.trackedTrips - row.cancelledTrips),
              maxDelaySeconds: row.maxDelaySeconds,
              delayP50Sum: row.delayP50Seconds,
              delayP90Sum: row.delayP90Seconds,
              occupancyScoreSum: row.occupancyScoreSum,
              occupancySamples: row.occupancySamples,
              crowdedVehicleSamples: row.crowdedVehicles,
              peakTrackedTrips: row.peakTrackedTrips,
              peakDelayedTrips: row.peakDelayedTrips,
              offPeakTrackedTrips: row.offPeakTrackedTrips,
              offPeakDelayedTrips: row.offPeakDelayedTrips,
              disruptionMinutes: row.disruptionMinutes,
              disruptionCountByEffect: row.disruptionCountByEffect,
              scheduledTrips: row.scheduledTrips,
            })),
          )
          .onConflictDoUpdate({
            target: [
              linePerformanceDaily.day,
              linePerformanceDaily.mode,
              linePerformanceDaily.line,
            ],
            set: {
              samples: sql`${linePerformanceDaily.samples} + excluded.samples`,
              trackedTrips: sql`${linePerformanceDaily.trackedTrips} + excluded.tracked_trips`,
              delayedTrips: sql`${linePerformanceDaily.delayedTrips} + excluded.delayed_trips`,
              cancelledTrips: sql`${linePerformanceDaily.cancelledTrips} + excluded.cancelled_trips`,
              skippedTrips: sql`${linePerformanceDaily.skippedTrips} + excluded.skipped_trips`,
              earlyTrips: sql`${linePerformanceDaily.earlyTrips} + excluded.early_trips`,
              delaySecondsSum: sql`${linePerformanceDaily.delaySecondsSum} + excluded.delay_seconds_sum`,
              maxDelaySeconds: sql`greatest(${linePerformanceDaily.maxDelaySeconds}, excluded.max_delay_seconds)`,
              delayP50Sum: sql`${linePerformanceDaily.delayP50Sum} + excluded.delay_p50_sum`,
              delayP90Sum: sql`${linePerformanceDaily.delayP90Sum} + excluded.delay_p90_sum`,
              occupancyScoreSum: sql`${linePerformanceDaily.occupancyScoreSum} + excluded.occupancy_score_sum`,
              occupancySamples: sql`${linePerformanceDaily.occupancySamples} + excluded.occupancy_samples`,
              crowdedVehicleSamples: sql`${linePerformanceDaily.crowdedVehicleSamples} + excluded.crowded_vehicle_samples`,
              peakTrackedTrips: sql`${linePerformanceDaily.peakTrackedTrips} + excluded.peak_tracked_trips`,
              peakDelayedTrips: sql`${linePerformanceDaily.peakDelayedTrips} + excluded.peak_delayed_trips`,
              offPeakTrackedTrips: sql`${linePerformanceDaily.offPeakTrackedTrips} + excluded.off_peak_tracked_trips`,
              offPeakDelayedTrips: sql`${linePerformanceDaily.offPeakDelayedTrips} + excluded.off_peak_delayed_trips`,
              disruptionMinutes: sql`${linePerformanceDaily.disruptionMinutes} + excluded.disruption_minutes`,
              disruptionCountByEffect: sql`(
                SELECT COALESCE(jsonb_object_agg(k, total), '{}'::jsonb)
                FROM (
                  SELECT key AS k, SUM(value::numeric)::int AS total
                  FROM (
                    SELECT * FROM jsonb_each_text(COALESCE(${linePerformanceDaily.disruptionCountByEffect}, '{}'::jsonb))
                    UNION ALL
                    SELECT * FROM jsonb_each_text(COALESCE(excluded.disruption_count_by_effect, '{}'::jsonb))
                  ) merged
                  GROUP BY key
                ) summed
              )`,
              scheduledTrips: sql`greatest(${linePerformanceDaily.scheduledTrips}, excluded.scheduled_trips)`,
            },
          });
      }

      await tx
        .delete(networkSnapshots)
        .where(
          sql`${networkSnapshots.capturedAt} < now() - make_interval(days => ${SNAPSHOT_RETENTION_DAYS})`,
        );

      await tx
        .delete(disruptionEvents)
        .where(
          sql`${disruptionEvents.capturedAt} < now() - make_interval(days => ${SNAPSHOT_RETENTION_DAYS})`,
        );
    });

    // Refresh network-wide daily MV (best-effort; non-fatal)
    try {
      await this.db.execute(
        sql`REFRESH MATERIALIZED VIEW CONCURRENTLY network_performance_daily_mv`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to refresh network_performance_daily_mv: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getMetrics(): Promise<SamplerMetrics> {
    const stored = await this.cache.get<SamplerMetrics>(SAMPLER_METRICS_KEY);
    return (
      stored ?? {
        lastSuccessAt: null,
        lastFailureAt: null,
        lastSampleDurationMs: null,
        lastLineCount: null,
        lastTripUpdateCount: null,
        consecutiveFailures: 0,
        successCount: 0,
        failureCount: 0,
      }
    );
  }

  private async recordMetrics(opts: {
    success: boolean;
    durationMs: number;
    lineCount: number | null;
    tripUpdateCount: number | null;
    reason?: string;
  }): Promise<void> {
    const prev = await this.getMetrics();
    const now = new Date().toISOString();
    const next: SamplerMetrics = {
      ...prev,
      lastSampleDurationMs: opts.durationMs,
      lastLineCount: opts.lineCount,
      lastTripUpdateCount: opts.tripUpdateCount,
      lastSuccessAt: opts.success ? now : prev.lastSuccessAt,
      lastFailureAt: opts.success ? prev.lastFailureAt : now,
      consecutiveFailures: opts.success ? 0 : prev.consecutiveFailures + 1,
      successCount: prev.successCount + (opts.success ? 1 : 0),
      failureCount: prev.failureCount + (opts.success ? 0 : 1),
    };
    await this.cache.set(SAMPLER_METRICS_KEY, next, 86_400);

    if (
      !opts.success &&
      next.consecutiveFailures >= 3 &&
      opts.reason !== 'empty'
    ) {
      this.logger.error(
        `History sampler has ${next.consecutiveFailures} consecutive failures (last reason=${opts.reason ?? 'unknown'})`,
      );
    }
  }

  /** Interval used when attributing disruption minutes — exposed for tests. */
  static readonly sampleIntervalMinutes = SAMPLE_INTERVAL_MINUTES;
}
