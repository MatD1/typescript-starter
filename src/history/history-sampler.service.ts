import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../database/database.module';
import {
  linePerformanceDaily,
  networkSnapshots,
} from '../database/schema/history.schema';
import { DisruptionsService } from '../disruptions/disruptions.service';
import { RealtimeService } from '../realtime/realtime.service';
import { lineFor } from './line-identity.util';

/** TfNSW punctuality convention: late = more than 5 minutes behind. */
const DELAY_THRESHOLD_SECONDS = 5 * 60;
const SAMPLE_INTERVAL_MINUTES = 5;
const SNAPSHOT_RETENTION_DAYS = 14;

interface LineAccumulator {
  mode: string;
  vehicles: number;
  trackedTrips: number;
  delayedTrips: number;
  cancelledTrips: number;
  delaySum: number;
  maxDelay: number;
  disruptions: number;
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
  ) {}

  @Cron('*/5 * * * *')
  async sample(): Promise<void> {
    if (this.disabled) return;
    try {
      const byLine = await this.collect();
      if (byLine.size === 0) {
        this.logger.warn('History sample collected no data — skipping write');
        return;
      }
      await this.persist(byLine);
      this.logger.log(`History sample stored for ${byLine.size} lines`);
    } catch (error) {
      this.logger.error(
        `History sampling failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async collect(): Promise<Map<string, LineAccumulator>> {
    const [tripUpdates, vehicles, alerts] = await Promise.all([
      this.realtimeService.getTripUpdates(),
      this.realtimeService.getVehiclePositions(),
      this.disruptionsService.getDisruptions(),
    ]);

    const byLine = new Map<string, LineAccumulator>();
    const acc = (mode: string, line: string): LineAccumulator => {
      const key = `${mode}|${line}`;
      let entry = byLine.get(key);
      if (!entry) {
        entry = {
          mode,
          vehicles: 0,
          trackedTrips: 0,
          delayedTrips: 0,
          cancelledTrips: 0,
          delaySum: 0,
          maxDelay: 0,
          disruptions: 0,
        };
        byLine.set(key, entry);
      }
      return entry;
    };

    for (const tu of tripUpdates) {
      const entry = acc(tu.mode, lineFor(tu.routeId, tu.tripId));
      entry.trackedTrips++;
      if (tu.scheduleRelationship === 'CANCELED') {
        entry.cancelledTrips++;
        continue;
      }
      const delay =
        tu.delay ??
        tu.stopTimeUpdates?.at(-1)?.departureDelay ??
        tu.stopTimeUpdates?.at(-1)?.arrivalDelay ??
        0;
      entry.delaySum += Math.max(0, delay);
      if (delay > DELAY_THRESHOLD_SECONDS) entry.delayedTrips++;
      if (delay > entry.maxDelay) entry.maxDelay = delay;
    }

    for (const vehicle of vehicles) {
      acc(vehicle.mode, lineFor(vehicle.routeId, vehicle.tripId)).vehicles++;
    }

    for (const alert of alerts) {
      const lines = new Set(
        alert.informedEntities
          .map((entity) => entity.routeId)
          .filter((routeId): routeId is string => Boolean(routeId))
          .map((routeId) => lineFor(routeId)),
      );
      if (lines.size === 0) lines.add('NETWORK');
      for (const line of lines) {
        acc(alert.mode, line).disruptions++;
      }
    }

    return byLine;
  }

  private async persist(byLine: Map<string, LineAccumulator>): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    const rows = [...byLine.entries()].map(([key, entry]) => ({
      mode: entry.mode,
      line: key.split('|')[1],
      vehicles: entry.vehicles,
      trackedTrips: entry.trackedTrips,
      delayedTrips: entry.delayedTrips,
      cancelledTrips: entry.cancelledTrips,
      avgDelaySeconds:
        entry.trackedTrips > 0
          ? Math.round(entry.delaySum / entry.trackedTrips)
          : 0,
      maxDelaySeconds: entry.maxDelay,
      activeDisruptions: entry.disruptions,
    }));

    await this.db.insert(networkSnapshots).values(rows);

    for (const row of rows) {
      await this.db
        .insert(linePerformanceDaily)
        .values({
          day,
          mode: row.mode,
          line: row.line,
          samples: 1,
          trackedTrips: row.trackedTrips,
          delayedTrips: row.delayedTrips,
          cancelledTrips: row.cancelledTrips,
          delaySecondsSum: row.avgDelaySeconds * row.trackedTrips,
          maxDelaySeconds: row.maxDelaySeconds,
          disruptionMinutes:
            row.activeDisruptions > 0 ? SAMPLE_INTERVAL_MINUTES : 0,
        })
        .onConflictDoUpdate({
          target: [
            linePerformanceDaily.day,
            linePerformanceDaily.mode,
            linePerformanceDaily.line,
          ],
          set: {
            samples: sql`${linePerformanceDaily.samples} + 1`,
            trackedTrips: sql`${linePerformanceDaily.trackedTrips} + ${row.trackedTrips}`,
            delayedTrips: sql`${linePerformanceDaily.delayedTrips} + ${row.delayedTrips}`,
            cancelledTrips: sql`${linePerformanceDaily.cancelledTrips} + ${row.cancelledTrips}`,
            delaySecondsSum: sql`${linePerformanceDaily.delaySecondsSum} + ${row.avgDelaySeconds * row.trackedTrips}`,
            maxDelaySeconds: sql`greatest(${linePerformanceDaily.maxDelaySeconds}, ${row.maxDelaySeconds})`,
            disruptionMinutes: sql`${linePerformanceDaily.disruptionMinutes} + ${row.activeDisruptions > 0 ? SAMPLE_INTERVAL_MINUTES : 0}`,
          },
        });
    }

    await this.db
      .delete(networkSnapshots)
      .where(
        sql`${networkSnapshots.capturedAt} < now() - make_interval(days => ${SNAPSHOT_RETENTION_DAYS})`,
      );
  }
}
