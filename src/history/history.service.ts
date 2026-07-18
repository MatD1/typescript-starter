import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../database/database.module';
import {
  linePerformanceDaily,
  networkSnapshots,
} from '../database/schema/history.schema';

export interface LinePerformanceDay {
  day: string;
  mode: string;
  line: string;
  trackedTrips: number;
  cancelledTrips: number;
  onTimePct: number | null;
  avgDelaySeconds: number | null;
  maxDelaySeconds: number;
  disruptionMinutes: number;
}

@Injectable()
export class HistoryService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** Daily performance for one line (or the whole network), newest first. */
  async linePerformance(options: {
    line?: string;
    mode?: string;
    days: number;
  }): Promise<LinePerformanceDay[]> {
    const since = new Date(Date.now() - options.days * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const conditions = [gte(linePerformanceDaily.day, since)];
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

    return rows.map((row) => ({
      day: row.day,
      mode: row.mode,
      line: row.line,
      trackedTrips: row.trackedTrips,
      cancelledTrips: row.cancelledTrips,
      onTimePct:
        row.trackedTrips > 0
          ? Math.round(
              (1000 * (row.trackedTrips - row.delayedTrips)) /
                row.trackedTrips,
            ) / 10
          : null,
      avgDelaySeconds:
        row.trackedTrips > 0
          ? Math.round(row.delaySecondsSum / row.trackedTrips)
          : null,
      maxDelaySeconds: row.maxDelaySeconds,
      disruptionMinutes: row.disruptionMinutes,
    }));
  }

  /** Latest snapshot per line — "network health right now". */
  async latestSnapshots(mode?: string) {
    const latest = this.db
      .select({ maxCaptured: sql<string>`max(${networkSnapshots.capturedAt})` })
      .from(networkSnapshots);

    const conditions = [
      sql`${networkSnapshots.capturedAt} = (${latest.getSQL()})`,
    ];
    if (mode) conditions.push(eq(networkSnapshots.mode, mode));

    return this.db
      .select()
      .from(networkSnapshots)
      .where(and(...conditions))
      .orderBy(networkSnapshots.line);
  }
}
