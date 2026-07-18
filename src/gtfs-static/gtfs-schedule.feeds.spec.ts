import {
  GTFS_SCHEDULE_FEEDS,
  getScheduleFeed,
  getScheduleFeedsForLogicalMode,
  isConsolidatedBusesUrl,
} from './gtfs-schedule.feeds';

describe('GTFS_SCHEDULE_FEEDS', () => {
  it('does not include the invalid consolidated /buses endpoint', () => {
    for (const feed of GTFS_SCHEDULE_FEEDS) {
      expect(isConsolidatedBusesUrl(feed.url)).toBe(false);
      expect(feed.url.endsWith('/schedule/buses')).toBe(false);
    }
  });

  it('includes metro on the v2 schedule URL', () => {
    const metro = getScheduleFeed('metro');
    expect(metro).toBeDefined();
    expect(metro!.url).toBe(
      'https://api.transport.nsw.gov.au/v2/gtfs/schedule/metro',
    );
  });

  it('includes all four lightrail sub-feeds', () => {
    const keys = getScheduleFeedsForLogicalMode('lightrail').map(
      (f) => f.feedKey,
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        'lightrail/innerwest',
        'lightrail/newcastle',
        'lightrail/cbdandsoutheast',
        'lightrail/parramatta',
      ]),
    );
    expect(keys).toHaveLength(4);
  });

  it('includes Sydney Ferries and Manly Fast Ferry', () => {
    const keys = getScheduleFeedsForLogicalMode('ferries').map((f) => f.feedKey);
    expect(keys).toEqual(
      expect.arrayContaining(['ferries/sydneyferries', 'ferries/MFF']),
    );
  });

  it('includes per-agency bus feeds', () => {
    const buses = getScheduleFeedsForLogicalMode('buses');
    expect(buses.length).toBeGreaterThanOrEqual(23);
    expect(getScheduleFeed('buses/GSBC001')?.url).toContain(
      '/v1/gtfs/schedule/buses/GSBC001',
    );
  });

  it('includes region bus feeds', () => {
    const regions = getScheduleFeedsForLogicalMode('regionbuses');
    expect(regions.length).toBe(13);
  });

  it('has unique feedKeys covering the full swagger catalog', () => {
    const keys = GTFS_SCHEDULE_FEEDS.map((f) => f.feedKey);
    expect(new Set(keys).size).toBe(keys.length);
    // metro + sydneytrains + nswtrains + 4 lightrail + 2 ferries + 23 buses + 13 regionbuses
    expect(GTFS_SCHEDULE_FEEDS.length).toBe(45);
  });

  it('detects consolidated buses URL', () => {
    expect(
      isConsolidatedBusesUrl(
        'https://api.transport.nsw.gov.au/v1/gtfs/schedule/buses',
      ),
    ).toBe(true);
    expect(
      isConsolidatedBusesUrl(
        'https://api.transport.nsw.gov.au/v1/gtfs/schedule/buses/GSBC001',
      ),
    ).toBe(false);
  });
});
