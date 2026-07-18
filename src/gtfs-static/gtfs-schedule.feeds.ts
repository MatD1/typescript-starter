/**
 * TfNSW realtime-aligned GTFS schedule feed catalog (45 feeds).
 *
 * Source: Open Data Hub schedule Swagger (v1) + metro on v2.
 * Never call consolidated /v1/gtfs/schedule/buses — TfNSW documents it as invalid.
 */

export type GtfsLogicalMode =
  | 'sydneytrains'
  | 'metro'
  | 'lightrail'
  | 'nswtrains'
  | 'buses'
  | 'ferries'
  | 'regionbuses';

export interface GtfsScheduleFeed {
  /** Stable id used as DB replace unit and S3 key segment, e.g. buses/GSBC001 */
  feedKey: string;
  /** Coarse mode for API filters (TRANSPORT_MODES-aligned where applicable) */
  logicalMode: GtfsLogicalMode;
  /** Full schedule ZIP URL */
  url: string;
}

const V1 = 'https://api.transport.nsw.gov.au/v1/gtfs/schedule';
const V2 = 'https://api.transport.nsw.gov.au/v2/gtfs/schedule';

const BUS_AGENCIES = [
  'SBSC006',
  'GSBC001',
  'GSBC002',
  'GSBC003',
  'GSBC004',
  'GSBC007',
  'GSBC008',
  'GSBC009',
  'GSBC010',
  'GSBC014',
  'OSMBSC001',
  'OSMBSC002',
  'OSMBSC003',
  'OSMBSC004',
  'OMBSC006',
  'OMBSC007',
  'OSMBSC008',
  'OSMBSC009',
  'OSMBSC010',
  'OSMBSC011',
  'OSMBSC012',
  'NISC001',
  'ReplacementBus',
] as const;

const REGION_BUS_FEEDS = [
  'southeasttablelands',
  'southeasttablelands2',
  'northcoast',
  'northcoast2',
  'northcoast3',
  'centralwestandorana',
  'centralwestandorana2',
  'riverinamurray',
  'riverinamurray2',
  'newenglandnorthwest',
  'sydneysurrounds',
  'newcastlehunter',
  'farwest',
] as const;

const LIGHTRAIL_FEEDS = [
  'innerwest',
  'newcastle',
  'cbdandsoutheast',
  'parramatta',
] as const;

function feed(
  feedKey: string,
  logicalMode: GtfsLogicalMode,
  url: string,
): GtfsScheduleFeed {
  return { feedKey, logicalMode, url };
}

export const GTFS_SCHEDULE_FEEDS: readonly GtfsScheduleFeed[] = [
  feed('metro', 'metro', `${V2}/metro`),
  feed('sydneytrains', 'sydneytrains', `${V1}/sydneytrains`),
  feed('nswtrains', 'nswtrains', `${V1}/nswtrains`),
  ...LIGHTRAIL_FEEDS.map((id) =>
    feed(`lightrail/${id}`, 'lightrail', `${V1}/lightrail/${id}`),
  ),
  feed('ferries/sydneyferries', 'ferries', `${V1}/ferries/sydneyferries`),
  feed('ferries/MFF', 'ferries', `${V1}/ferries/MFF`),
  ...BUS_AGENCIES.map((id) =>
    feed(`buses/${id}`, 'buses', `${V1}/buses/${id}`),
  ),
  ...REGION_BUS_FEEDS.map((id) =>
    feed(`regionbuses/${id}`, 'regionbuses', `${V1}/regionbuses/${id}`),
  ),
];

const FEEDS_BY_KEY = new Map(
  GTFS_SCHEDULE_FEEDS.map((f) => [f.feedKey, f] as const),
);

export function getScheduleFeed(feedKey: string): GtfsScheduleFeed | undefined {
  return FEEDS_BY_KEY.get(feedKey);
}

export function getScheduleFeedsForLogicalMode(
  logicalMode: string,
): GtfsScheduleFeed[] {
  return GTFS_SCHEDULE_FEEDS.filter((f) => f.logicalMode === logicalMode);
}

/** True if url is the invalid consolidated buses endpoint. */
export function isConsolidatedBusesUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/$/, '') === '/v1/gtfs/schedule/buses';
  } catch {
    return false;
  }
}
