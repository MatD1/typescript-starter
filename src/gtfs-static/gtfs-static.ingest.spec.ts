import { Test, TestingModule } from '@nestjs/testing';
import { DRIZZLE } from '../database/database.module';
import { GtfsStaticService } from './gtfs-static.service';
import { CacheService } from '../cache/cache.service';
import { TfnswHttpClient } from '../transport/tfnsw-http.client';
import { S3Service } from '../storage/s3.service';
import { gtfsIngestFeedRun } from '../database/schema/gtfs.schema';

describe('GtfsStaticService ingest resolveZipBuffer behaviour', () => {
  let service: GtfsStaticService;
  let tfnsw: {
    head: jest.Mock;
    getScheduleZip: jest.Mock;
  };
  let s3: {
    isEnabled: jest.Mock;
    headLatest: jest.Mock;
    getLatestBuffer: jest.Mock;
    putGtfsZip: jest.Mock;
  };
  let mockDb: {
    insert: jest.Mock;
    update: jest.Mock;
    transaction: jest.Mock;
    delete: jest.Mock;
    select: jest.Mock;
    execute: jest.Mock;
  };

  beforeEach(async () => {
    const insertChain = {
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
        onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
      }),
    };
    const updateChain = {
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    };

    mockDb = {
      insert: jest.fn().mockReturnValue(insertChain),
      update: jest.fn().mockReturnValue(updateChain),
      transaction: jest.fn(async (fn) => fn(mockDb)),
      delete: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
          where: jest.fn().mockResolvedValue([{ total: 1 }]),
        }),
      }),
      execute: jest.fn().mockResolvedValue(undefined),
    };

    tfnsw = {
      head: jest.fn(),
      getScheduleZip: jest.fn(),
    };

    s3 = {
      isEnabled: jest.fn().mockReturnValue(true),
      headLatest: jest.fn(),
      getLatestBuffer: jest.fn(),
      putGtfsZip: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GtfsStaticService,
        { provide: DRIZZLE, useValue: mockDb },
        {
          provide: CacheService,
          useValue: { get: jest.fn(), set: jest.fn() },
        },
        { provide: TfnswHttpClient, useValue: tfnsw },
        { provide: S3Service, useValue: s3 },
      ],
    }).compile();

    service = module.get(GtfsStaticService);
  });

  it('skips GET when S3 latest Last-Modified matches HEAD', async () => {
    const lastModified = 'Wed, 01 Jan 2025 00:00:00 GMT';
    tfnsw.head.mockResolvedValue({ status: 200, lastModified });
    s3.headLatest.mockResolvedValue({
      key: 'gtfs/schedule/sydneytrains/latest.zip',
      exists: true,
      lastModified,
    });

    // Minimal valid GTFS zip — build with unzipper.Open.buffer needs a real zip.
    // Create via dynamic import of adm-zip? Not installed. Use JSZip? Not installed.
    // Use Python? Instead spy processZip.
    const zipBuf = await buildMinimalGtfsZip();
    s3.getLatestBuffer.mockResolvedValue(zipBuf);

    const result = await service.ingestMode('sydneytrains');
    const single = Array.isArray(result) ? result[0] : result;

    expect(tfnsw.getScheduleZip).not.toHaveBeenCalled();
    expect(s3.getLatestBuffer).toHaveBeenCalled();
    expect(single.success).toBe(true);
    expect(single.skippedUnchanged).toBe(true);
  });

  it('GETs and puts to S3 when Last-Modified changed', async () => {
    tfnsw.head.mockResolvedValue({
      status: 200,
      lastModified: 'Thu, 02 Jan 2025 00:00:00 GMT',
    });
    s3.headLatest.mockResolvedValue({
      key: 'gtfs/schedule/sydneytrains/latest.zip',
      exists: true,
      lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT',
    });
    const zipBuf = await buildMinimalGtfsZip();
    tfnsw.getScheduleZip.mockResolvedValue({
      status: 200,
      data: zipBuf,
      lastModified: 'Thu, 02 Jan 2025 00:00:00 GMT',
    });
    s3.putGtfsZip.mockResolvedValue({
      latestKey: 'gtfs/schedule/sydneytrains/latest.zip',
      datedKey: 'gtfs/schedule/sydneytrains/2025-01-02.zip',
    });

    const result = await service.ingestMode('sydneytrains');
    const single = Array.isArray(result) ? result[0] : result;

    expect(tfnsw.getScheduleZip).toHaveBeenCalled();
    expect(s3.putGtfsZip).toHaveBeenCalled();
    expect(single.success).toBe(true);
    expect(single.skippedUnchanged).toBe(false);
  });

  it('refuses unknown mode', async () => {
    const result = await service.ingestMode('not-a-real-mode');
    const single = Array.isArray(result) ? result[0] : result;
    expect(single.success).toBe(false);
    expect(single.error).toMatch(/Unknown/);
  });

  it('records ingest run rows', async () => {
    tfnsw.head.mockResolvedValue({
      status: 200,
      lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT',
    });
    s3.isEnabled.mockReturnValue(false);
    const zipBuf = await buildMinimalGtfsZip();
    tfnsw.getScheduleZip.mockResolvedValue({
      status: 200,
      data: zipBuf,
      lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT',
    });

    await service.ingestMode('metro');

    expect(mockDb.insert).toHaveBeenCalledWith(gtfsIngestFeedRun);
  });

  it('force=true bypasses S3 Last-Modified skip and always GETs', async () => {
    const lastModified = 'Wed, 01 Jan 2025 00:00:00 GMT';
    tfnsw.head.mockResolvedValue({ status: 200, lastModified });
    s3.headLatest.mockResolvedValue({
      key: 'gtfs/schedule/sydneytrains/latest.zip',
      exists: true,
      lastModified,
    });
    const zipBuf = await buildMinimalGtfsZip();
    tfnsw.getScheduleZip.mockResolvedValue({
      status: 200,
      data: zipBuf,
      lastModified,
    });
    s3.putGtfsZip.mockResolvedValue({
      latestKey: 'gtfs/schedule/sydneytrains/latest.zip',
      datedKey: 'gtfs/schedule/sydneytrains/2025-01-01.zip',
    });

    const result = await service.ingestMode('sydneytrains', { force: true });
    const single = Array.isArray(result) ? result[0] : result;

    expect(tfnsw.getScheduleZip).toHaveBeenCalled();
    expect(s3.getLatestBuffer).not.toHaveBeenCalled();
    expect(s3.putGtfsZip).toHaveBeenCalled();
    expect(single.success).toBe(true);
    expect(single.skippedUnchanged).toBe(false);
  });
});

/** Build a minimal in-memory ZIP containing required GTFS CSVs. */
async function buildMinimalGtfsZip(): Promise<Buffer> {
  // Use Node zlib + local zip format via `unzipper` write stream isn't exported.
  // Fall back to spawning a tiny zip with the `zip` CLI if available, else
  // construct PKZIP locally.
  const entries: { name: string; data: string }[] = [
    {
      name: 'routes.txt',
      data: 'route_id,agency_id,route_short_name,route_long_name,route_type\nR1,A,T1,Test Route,1\n',
    },
    {
      name: 'stops.txt',
      data: 'stop_id,stop_name,stop_lat,stop_lon\nS1,Stop One,-33.8,151.2\n',
    },
    {
      name: 'trips.txt',
      data: 'route_id,service_id,trip_id\nR1,SVC1,T1\n',
    },
    {
      name: 'calendar.txt',
      data: 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nSVC1,1,1,1,1,1,0,0,20250101,20261231\n',
    },
    {
      name: 'stop_times.txt',
      data: 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,08:00:00,08:00:00,S1,1\n',
    },
  ];

  return createZipBuffer(entries);
}

function createZipBuffer(
  entries: { name: string; data: string }[],
): Buffer {
  // Minimal ZIP (store method, no compression)
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const dataBuf = Buffer.from(entry.data, 'utf8');
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header sig
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // compression = store
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(crc32(dataBuf), 14);
    localHeader.writeUInt32LE(dataBuf.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    parts.push(localHeader, dataBuf);

    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc32(dataBuf), 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);
    central.push(centralHeader);

    offset += localHeader.length + dataBuf.length;
  }

  const centralDir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, centralDir, end]);
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
