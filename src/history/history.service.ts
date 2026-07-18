import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../database/database.module';
import {
  linePerformanceDaily,
  networkSnapshots,
} from '../database/schema/history.schema';
import { sydneyDaysAgo, sydneyLocalDate } from './sydney-date.util';

export interface LinePerformanceDay {
  day: string;
  mode: string;
  line: string;
  samples: number;
  trackedTrips: number;
  delayedTrips: number;
  cancelledTrips: number;
  skippedTrips: number;
  earlyTrips: number;
  onTimePct: number | null;
  peakOnTimePct: number | null;
  offPeakOnTimePct: number | null;
  avgDelaySeconds: number | null;
  maxDelaySeconds: number;
  delayP50Seconds: number | null;
  delayP90Seconds: number | null;
  avgOccupancy: number | null;
  crowdedVehicleSamples: number;
  disruptionMinutes: number;
  disruptionCounts: Array<{ effect: string; count: number }>;
  scheduledTrips: number;
  reliabilityPct: number | null;
}

export interface NetworkPerformanceSummary {
  days: number;
  totalTrackedTrips: number;
  totalDelayedTrips: number;
  totalCancelledTrips: number;
  totalDisruptionMinutes: number;
  onTimePct: number | null;
  worstLine: string | null;
  worstLineOnTimePct: number | null;
}

export interface LinePerformanceComparison {
  line: string;
  mode: string | null;
  periodA: { from: string; to: string; onTimePct: number | null; avgDelaySeconds: number | null; disruptionMinutes: number };
  periodB: { from: string; to: string; onTimePct: number | null; avgDelaySeconds: number | null; disruptionMinutes: number };
  onTimePctDelta: number | null;
  avgDelaySecondsDelta: number | null;
  disruptionMinutesDelta: number;
}

@Injectable()
export class HistoryService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** Daily performance for one line (or the whole network), newest first. */
  async linePerformance(options: {
    line?: string;
    mode?: string;
    days: number;
    from?: string;
    to?: string;
  }): Promise<LinePerformanceDay[]> {
    const conditions = [];
    if (options.from && options.to) {
      conditions.push(gte(linePerformanceDaily.day, options.from));
      conditions.push(lte(linePerformanceDaily.day, options.to));
    } else {
      conditions.push(
        gte(linePerformanceDaily.day, sydneyDaysAgo(options.days)),
      );
    }
    if (options.line) {
      conditions.push(eq(linePerformanceDaily.line, options.line.toUpperCase()));
    }
    if (options.mode) {
      conditions.push(eq(linePerformanceDaily.mode, options.mode));
    }

    const rows = await this.db
      .select()
      .from(linePerformanceDaily)
      .where(and(...conditions))
      .orderBy(desc(linePerformanceDaily.day), linePerformanceDaily.line);

    return rows.map((row) => this.mapDailyRow(row));
  }

  /** Latest snapshot per (mode, line) via DISTINCT ON. */
  async latestSnapshots(mode?: string) {
    const modeFilter = mode
      ? sql`AND mode = ${mode}`
      : sql``;

    const result = await this.db.execute(sql`
      SELECT DISTINCT ON (mode, line)
        id,
        captured_at AS "capturedAt",
        mode,
        line,
        vehicles,
        tracked_trips AS "trackedTrips",
        delayed_trips AS "delayedTrips",
        cancelled_trips AS "cancelledTrips",
        skipped_trips AS "skippedTrips",
        early_trips AS "earlyTrips",
        avg_delay_seconds AS "avgDelaySeconds",
        max_delay_seconds AS "maxDelaySeconds",
        delay_p50_seconds AS "delayP50Seconds",
        delay_p90_seconds AS "delayP90Seconds",
        avg_occupancy AS "avgOccupancy",
        crowded_vehicles AS "crowdedVehicles",
        active_disruptions AS "activeDisruptions",
        scheduled_trips AS "scheduledTrips"
      FROM network_snapshots
      WHERE 1=1 ${modeFilter}
      ORDER BY mode, line, captured_at DESC
    `);

    return result.rows as Array<{
      capturedAt: Date;
      mode: string;
      line: string;
      vehicles: number;
      trackedTrips: number;
      delayedTrips: number;
      cancelledTrips: number;
      skippedTrips: number;
      earlyTrips: number;
      avgDelaySeconds: number;
      maxDelaySeconds: number;
      delayP50Seconds: number;
      delayP90Seconds: number;
      avgOccupancy: number;
      crowdedVehicles: number;
      activeDisruptions: number;
      scheduledTrips: number;
    }>;
  }

  /** Time-series of snapshots for charts (within retention window). */
  async snapshotHistory(options: {
    line?: string;
    mode?: string;
    hours: number;
  }) {
    const since = new Date(Date.now() - options.hours * 3_600_000);
    const conditions = [gte(networkSnapshots.capturedAt, since)];
    if (options.line) {
      conditions.push(eq(networkSnapshots.line, options.line.toUpperCase()));
    }
    if (options.mode) {
      conditions.push(eq(networkSnapshots.mode, options.mode));
    }

    return this.db
      .select()
      .from(networkSnapshots)
      .where(and(...conditions))
      .orderBy(desc(networkSnapshots.capturedAt), networkSnapshots.line);
  }

  /** Network-wide weighted summary over the last N Sydney days. */
  async networkPerformanceSummary(
    days: number,
  ): Promise<NetworkPerformanceSummary> {
    const since = sydneyDaysAgo(days);
    const [agg] = await this.db
      .select({
        totalTrackedTrips: sql<number>`coalesce(sum(${linePerformanceDaily.trackedTrips}), 0)`,
        totalDelayedTrips: sql<number>`coalesce(sum(${linePerformanceDaily.delayedTrips}), 0)`,
        totalCancelledTrips: sql<number>`coalesce(sum(${linePerformanceDaily.cancelledTrips}), 0)`,
        totalDisruptionMinutes: sql<number>`coalesce(sum(${linePerformanceDaily.disruptionMinutes}), 0)`,
      })
      .from(linePerformanceDaily)
      .where(gte(linePerformanceDaily.day, since));

    const lineRows = await this.db
      .select({
        line: linePerformanceDaily.line,
        tracked: sql<number>`sum(${linePerformanceDaily.trackedTrips})`,
        delayed: sql<number>`sum(${linePerformanceDaily.delayedTrips})`,
      })
      .from(linePerformanceDaily)
      .where(gte(linePerformanceDaily.day, since))
      .groupBy(linePerformanceDaily.line);

    let worstLine: string | null = null;
    let worstLineOnTimePct: number | null = null;
    for (const row of lineRows) {
      const tracked = Number(row.tracked);
      if (tracked <= 0) continue;
      const pct =
        Math.round((1000 * (tracked - Number(row.delayed))) / tracked) / 10;
      if (worstLineOnTimePct === null || pct < worstLineOnTimePct) {
        worstLine = row.line;
        worstLineOnTimePct = pct;
      }
    }

    const totalTracked = Number(agg?.totalTrackedTrips ?? 0);
    const totalDelayed = Number(agg?.totalDelayedTrips ?? 0);

    return {
      days,
      totalTrackedTrips: totalTracked,
      totalDelayedTrips: totalDelayed,
      totalCancelledTrips: Number(agg?.totalCancelledTrips ?? 0),
      totalDisruptionMinutes: Number(agg?.totalDisruptionMinutes ?? 0),
      onTimePct:
        totalTracked > 0
          ? Math.round((1000 * (totalTracked - totalDelayed)) / totalTracked) /
            10
          : null,
      worstLine,
      worstLineOnTimePct,
    };
  }

  /** Compare a line's performance across two date ranges. */
  async compareLinePerformance(options: {
    line: string;
    mode?: string;
    periodAFrom: string;
    periodATo: string;
    periodBFrom: string;
    periodBTo: string;
  }): Promise<LinePerformanceComparison> {
    const line = options.line.toUpperCase();
    const periodA = await this.aggregatePeriod(
      line,
      options.mode,
      options.periodAFrom,
      options.periodATo,
    );
    const periodB = await this.aggregatePeriod(
      line,
      options.mode,
      options.periodBFrom,
      options.periodBTo,
    );

    return {
      line,
      mode: options.mode ?? null,
      periodA: {
        from: options.periodAFrom,
        to: options.periodATo,
        ...periodA,
      },
      periodB: {
        from: options.periodBFrom,
        to: options.periodBTo,
        ...periodB,
      },
      onTimePctDelta:
        periodA.onTimePct != null && periodB.onTimePct != null
          ? Math.round((periodB.onTimePct - periodA.onTimePct) * 10) / 10
          : null,
      avgDelaySecondsDelta:
        periodA.avgDelaySeconds != null && periodB.avgDelaySeconds != null
          ? periodB.avgDelaySeconds - periodA.avgDelaySeconds
          : null,
      disruptionMinutesDelta:
        periodB.disruptionMinutes - periodA.disruptionMinutes,
    };
  }

  /** CSV export of daily performance rows. */
  async exportLinePerformanceCsv(options: {
    line?: string;
    mode?: string;
    days: number;
  }): Promise<string> {
    const rows = await this.linePerformance(options);
    const header = [
      'day',
      'mode',
      'line',
      'samples',
      'trackedTrips',
      'delayedTrips',
      'cancelledTrips',
      'skippedTrips',
      'earlyTrips',
      'onTimePct',
      'peakOnTimePct',
      'offPeakOnTimePct',
      'avgDelaySeconds',
      'maxDelaySeconds',
      'delayP50Seconds',
      'delayP90Seconds',
      'avgOccupancy',
      'crowdedVehicleSamples',
      'disruptionMinutes',
      'scheduledTrips',
      'reliabilityPct',
    ].join(',');

    const lines = rows.map((r) =>
      [
        r.day,
        r.mode,
        r.line,
        r.samples,
        r.trackedTrips,
        r.delayedTrips,
        r.cancelledTrips,
        r.skippedTrips,
        r.earlyTrips,
        r.onTimePct ?? '',
        r.peakOnTimePct ?? '',
        r.offPeakOnTimePct ?? '',
        r.avgDelaySeconds ?? '',
        r.maxDelaySeconds,
        r.delayP50Seconds ?? '',
        r.delayP90Seconds ?? '',
        r.avgOccupancy ?? '',
        r.crowdedVehicleSamples,
        r.disruptionMinutes,
        r.scheduledTrips,
        r.reliabilityPct ?? '',
      ].join(','),
    );

    return [header, ...lines].join('\n');
  }

  private async aggregatePeriod(
    line: string,
    mode: string | undefined,
    from: string,
    to: string,
  ) {
    const conditions = [
      eq(linePerformanceDaily.line, line),
      gte(linePerformanceDaily.day, from),
      lte(linePerformanceDaily.day, to),
    ];
    if (mode) conditions.push(eq(linePerformanceDaily.mode, mode));

    const [row] = await this.db
      .select({
        tracked: sql<number>`coalesce(sum(${linePerformanceDaily.trackedTrips}), 0)`,
        delayed: sql<number>`coalesce(sum(${linePerformanceDaily.delayedTrips}), 0)`,
        delaySum: sql<number>`coalesce(sum(${linePerformanceDaily.delaySecondsSum}), 0)`,
        disruptionMinutes: sql<number>`coalesce(sum(${linePerformanceDaily.disruptionMinutes}), 0)`,
      })
      .from(linePerformanceDaily)
      .where(and(...conditions));

    const tracked = Number(row?.tracked ?? 0);
    const delayed = Number(row?.delayed ?? 0);
    const delaySum = Number(row?.delaySum ?? 0);

    return {
      onTimePct:
        tracked > 0
          ? Math.round((1000 * (tracked - delayed)) / tracked) / 10
          : null,
      avgDelaySeconds: tracked > 0 ? Math.round(delaySum / tracked) : null,
      disruptionMinutes: Number(row?.disruptionMinutes ?? 0),
    };
  }

  private mapDailyRow(
    row: typeof linePerformanceDaily.$inferSelect,
  ): LinePerformanceDay {
    const onTimePct =
      row.trackedTrips > 0
        ? Math.round(
            (1000 * (row.trackedTrips - row.delayedTrips)) / row.trackedTrips,
          ) / 10
        : null;
    const peakOnTimePct =
      row.peakTrackedTrips > 0
        ? Math.round(
            (1000 * (row.peakTrackedTrips - row.peakDelayedTrips)) /
              row.peakTrackedTrips,
          ) / 10
        : null;
    const offPeakOnTimePct =
      row.offPeakTrackedTrips > 0
        ? Math.round(
            (1000 * (row.offPeakTrackedTrips - row.offPeakDelayedTrips)) /
              row.offPeakTrackedTrips,
          ) / 10
        : null;

    return {
      day: row.day,
      mode: row.mode,
      line: row.line,
      samples: row.samples,
      trackedTrips: row.trackedTrips,
      delayedTrips: row.delayedTrips,
      cancelledTrips: row.cancelledTrips,
      skippedTrips: row.skippedTrips,
      earlyTrips: row.earlyTrips,
      onTimePct,
      peakOnTimePct,
      offPeakOnTimePct,
      avgDelaySeconds:
        row.trackedTrips > 0
          ? Math.round(row.delaySecondsSum / row.trackedTrips)
          : null,
      maxDelaySeconds: row.maxDelaySeconds,
      delayP50Seconds:
        row.samples > 0 ? Math.round(row.delayP50Sum / row.samples) : null,
      delayP90Seconds:
        row.samples > 0 ? Math.round(row.delayP90Sum / row.samples) : null,
      avgOccupancy:
        row.occupancySamples > 0
          ? Math.round(row.occupancyScoreSum / row.occupancySamples)
          : null,
      crowdedVehicleSamples: row.crowdedVehicleSamples,
      disruptionMinutes: row.disruptionMinutes,
      disruptionCounts: Object.entries(
        (row.disruptionCountByEffect as Record<string, number>) ?? {},
      ).map(([effect, count]) => ({ effect, count })),
      scheduledTrips: row.scheduledTrips,
      reliabilityPct:
        row.scheduledTrips > 0
          ? Math.round(
              (1000 * Math.min(row.trackedTrips, row.scheduledTrips)) /
                row.scheduledTrips,
            ) / 10
          : null,
    };
  }

  /** Today in Sydney — used by tests and callers needing calendar alignment. */
  sydneyToday(): string {
    return sydneyLocalDate();
  }
}
