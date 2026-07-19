import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HistoryService } from '../history/history.service';
import { PushService } from './push.service';

/** Rail lines eligible for commute alerts. */
const RAIL_LINES = new Set([
  'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9',
  'M1', 'CCN', 'BMT', 'HUN', 'SCO', 'SHL',
]);

/** A line is "degraded" when this share of tracked trips is >5 min late. */
const DELAYED_SHARE_THRESHOLD = 0.3;
const MIN_TRACKED_TRIPS = 5;
/** Don't re-alert the same line within this window. */
const COOLDOWN_MS = 45 * 60 * 1000;
/** Commuters only care during waking hours (Sydney time). */
const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 5;

/**
 * The smart commute push: every 5 minutes, look at the latest per-line
 * snapshot from the history sampler; when a line a user might be riding is
 * meaningfully degraded (widespread delays or a severe disruption), publish
 * one push to that line's FCM topic — capped by a per-line cooldown so a bad
 * morning is one notification, not twelve.
 */
@Injectable()
export class CommuteAlertService {
  private readonly logger = new Logger(CommuteAlertService.name);
  private readonly lastAlertAt = new Map<string, number>();
  private readonly disabled =
    process.env.COMMUTE_ALERTS_DISABLED === 'true';

  constructor(
    private readonly historyService: HistoryService,
    private readonly pushService: PushService,
  ) {}

  @Cron('2-59/5 * * * *') // offset from the sampler's */5 so data is fresh
  async evaluate(): Promise<void> {
    if (this.disabled) return;
    const sydneyHour = Number(
      new Intl.DateTimeFormat('en-AU', {
        hour: 'numeric',
        hour12: false,
        timeZone: 'Australia/Sydney',
      }).format(new Date()),
    );
    if (sydneyHour >= QUIET_START_HOUR || sydneyHour < QUIET_END_HOUR) return;

    let snapshots;
    try {
      snapshots = await this.historyService.latestSnapshots();
    } catch (error) {
      this.logger.warn(
        `Commute alert scan skipped: ${error instanceof Error ? error.message : error}`,
      );
      return;
    }

    const now = Date.now();
    for (const snap of snapshots) {
      if (!RAIL_LINES.has(snap.line)) continue;
      if (snap.trackedTrips < MIN_TRACKED_TRIPS) continue;

      const delayedShare = snap.delayedTrips / snap.trackedTrips;
      const widespreadDelays = delayedShare >= DELAYED_SHARE_THRESHOLD;
      const severeDisruption = snap.activeDisruptions > 0 && delayedShare > 0.15;
      const cancellations = snap.cancelledTrips >= 3;
      if (!widespreadDelays && !severeDisruption && !cancellations) continue;

      const last = this.lastAlertAt.get(snap.line) ?? 0;
      if (now - last < COOLDOWN_MS) continue;
      this.lastAlertAt.set(snap.line, now);

      const avgMin = Math.round(snap.avgDelaySeconds / 60);
      const body = cancellations
        ? `${snap.cancelledTrips} services cancelled — check before you travel.`
        : `${Math.round(delayedShare * 100)}% of services are running late` +
          (avgMin >= 1 ? ` (avg ${avgMin} min).` : '.') +
          ' Allow extra time.';

      await this.pushService.sendToLine(
        snap.line,
        `${snap.line} line delays`,
        body,
        { type: 'commute_alert' },
      );
    }
  }
}
