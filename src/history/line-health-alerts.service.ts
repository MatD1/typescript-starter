import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, lte, notInArray } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../database/database.module';
import { lineHealthAlerts } from '../database/schema/history.schema';

export type LineAlertSeverity = 'delays' | 'cancellations' | 'disruption';

export interface ActiveLineAlert {
  line: string;
  severity: LineAlertSeverity;
  title: string;
  body: string;
  since: Date;
}

/** Hard backstop — an alert auto-expires this long after it last updated, even if the scan stops running. */
const ALERT_TTL_MS = 3 * 60 * 60 * 1000;

/**
 * Keeps the "is this line currently degraded?" flag riders see on the
 * network-health screen in sync with the same condition that drives the
 * commute push — resolved the moment the condition clears on a later scan,
 * not left showing a stale warning.
 */
@Injectable()
export class LineHealthAlertsService {
  private readonly logger = new Logger(LineHealthAlertsService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** Open (or refresh) the active alert for a line. */
  async upsertActive(
    line: string,
    severity: LineAlertSeverity,
    title: string,
    body: string,
  ): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ALERT_TTL_MS);

    const existing = await this.db
      .select({ id: lineHealthAlerts.id })
      .from(lineHealthAlerts)
      .where(
        and(eq(lineHealthAlerts.line, line), isNull(lineHealthAlerts.resolvedAt)),
      )
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(lineHealthAlerts)
        .set({ severity, title, body, updatedAt: now, expiresAt })
        .where(eq(lineHealthAlerts.id, existing[0].id));
      return;
    }

    await this.db.insert(lineHealthAlerts).values({
      line,
      severity,
      title,
      body,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });
  }

  /**
   * Resolves every open alert whose line is no longer degraded this cycle,
   * plus (as a backstop) any open alert that's simply run past its TTL.
   */
  async resolveStale(
    trackedLines: Iterable<string>,
    stillDegradedLines: ReadonlySet<string>,
  ): Promise<void> {
    const now = new Date();
    const noLongerDegraded = [...trackedLines].filter(
      (l) => !stillDegradedLines.has(l),
    );

    try {
      if (noLongerDegraded.length > 0) {
        const clearedCondition =
          stillDegradedLines.size > 0
            ? and(
                isNull(lineHealthAlerts.resolvedAt),
                inArray(lineHealthAlerts.line, noLongerDegraded),
                notInArray(lineHealthAlerts.line, [...stillDegradedLines]),
              )
            : and(
                isNull(lineHealthAlerts.resolvedAt),
                inArray(lineHealthAlerts.line, noLongerDegraded),
              );

        await this.db
          .update(lineHealthAlerts)
          .set({ resolvedAt: now })
          .where(clearedCondition);
      }

      // Backstop: an alert that's simply been open too long, regardless of
      // whether we still consider its line degraded (covers the scan being
      // down or a TfNSW alert lingering past what riders care about).
      await this.db
        .update(lineHealthAlerts)
        .set({ resolvedAt: now })
        .where(
          and(
            isNull(lineHealthAlerts.resolvedAt),
            lte(lineHealthAlerts.expiresAt, now),
          ),
        );
    } catch (e) {
      this.logger.warn(`Failed to resolve stale line alerts: ${e}`);
    }
  }

  /** Every currently-active (unresolved, unexpired) alert, keyed by line. */
  async activeByLine(): Promise<Map<string, ActiveLineAlert>> {
    const now = new Date();
    const rows = await this.db
      .select()
      .from(lineHealthAlerts)
      .where(and(isNull(lineHealthAlerts.resolvedAt), gt(lineHealthAlerts.expiresAt, now)));

    const map = new Map<string, ActiveLineAlert>();
    for (const row of rows) {
      map.set(row.line, {
        line: row.line,
        severity: row.severity as LineAlertSeverity,
        title: row.title,
        body: row.body,
        since: row.createdAt,
      });
    }
    return map;
  }
}
