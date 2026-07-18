/** TfNSW punctuality convention: late = more than 5 minutes behind. */
export const DELAY_THRESHOLD_SECONDS = 5 * 60;

export const SAMPLE_INTERVAL_MINUTES = 5;

/** Short-term snapshot retention — keep in sync with schema comment. */
export const SNAPSHOT_RETENTION_DAYS = 30;

/** Skip sampling when the newest trip-update timestamp is older than this. */
export const STALE_FEED_THRESHOLD_SECONDS = 10 * 60;

export const SAMPLER_LOCK_KEY = 'history:sampler:lock';

/** Lock TTL — slightly less than the 5-minute cron interval. */
export const SAMPLER_LOCK_TTL_SECONDS = 4 * 60;

export const SAMPLER_METRICS_KEY = 'history:sampler:metrics';
