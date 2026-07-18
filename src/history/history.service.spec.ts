import { Test, TestingModule } from '@nestjs/testing';
import { DRIZZLE } from '../database/database.module';
import { HistoryService } from './history.service';

describe('HistoryService', () => {
  let service: HistoryService;
  const selectChain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue([]),
    groupBy: jest.fn().mockResolvedValue([]),
  };
  const mockDb = {
    select: jest.fn(() => selectChain),
    execute: jest.fn().mockResolvedValue({ rows: [] }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    selectChain.from.mockReturnThis();
    selectChain.where.mockReturnThis();
    selectChain.orderBy.mockResolvedValue([]);
    selectChain.groupBy.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoryService,
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    service = module.get(HistoryService);
  });

  it('maps daily rows to on-time percentage', async () => {
    selectChain.orderBy.mockResolvedValue([
      {
        day: '2026-07-18',
        mode: 'sydneytrains',
        line: 'T1',
        samples: 10,
        trackedTrips: 100,
        delayedTrips: 10,
        cancelledTrips: 2,
        skippedTrips: 1,
        earlyTrips: 3,
        delaySecondsSum: 5000,
        maxDelaySeconds: 600,
        delayP50Sum: 100,
        delayP90Sum: 400,
        occupancyScoreSum: 20,
        occupancySamples: 10,
        crowdedVehicleSamples: 2,
        peakTrackedTrips: 40,
        peakDelayedTrips: 8,
        offPeakTrackedTrips: 60,
        offPeakDelayedTrips: 2,
        disruptionMinutes: 15,
        disruptionCountByEffect: { NO_SERVICE: 2 },
        scheduledTrips: 120,
      },
    ]);

    const rows = await service.linePerformance({ days: 7 });
    expect(rows).toHaveLength(1);
    expect(rows[0].onTimePct).toBe(90);
    expect(rows[0].samples).toBe(10);
    expect(rows[0].avgDelaySeconds).toBe(50);
    expect(rows[0].peakOnTimePct).toBe(80);
    expect(rows[0].offPeakOnTimePct).toBe(96.7);
    expect(rows[0].disruptionCounts).toEqual([
      { effect: 'NO_SERVICE', count: 2 },
    ]);
    expect(rows[0].reliabilityPct).toBe(83.3);
  });

  it('returns null onTimePct when no tracked trips', async () => {
    selectChain.orderBy.mockResolvedValue([
      {
        day: '2026-07-18',
        mode: 'sydneytrains',
        line: 'T1',
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
        peakTrackedTrips: 0,
        peakDelayedTrips: 0,
        offPeakTrackedTrips: 0,
        offPeakDelayedTrips: 0,
        disruptionMinutes: 0,
        disruptionCountByEffect: {},
        scheduledTrips: 0,
      },
    ]);

    const rows = await service.linePerformance({ days: 1 });
    expect(rows[0].onTimePct).toBeNull();
    expect(rows[0].avgDelaySeconds).toBeNull();
  });

  it('exports CSV with header row', async () => {
    selectChain.orderBy.mockResolvedValue([]);
    const csv = await service.exportLinePerformanceCsv({ days: 7 });
    expect(csv.startsWith('day,mode,line,samples')).toBe(true);
  });

  it('uses DISTINCT ON query for latest snapshots', async () => {
    await service.latestSnapshots('sydneytrains');
    expect(mockDb.execute).toHaveBeenCalled();
    const sqlObj = mockDb.execute.mock.calls[0][0] as {
      queryChunks?: unknown[];
    };
    const text = JSON.stringify(sqlObj);
    expect(text).toContain('DISTINCT ON');
  });
});
