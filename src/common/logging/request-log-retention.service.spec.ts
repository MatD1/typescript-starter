import { ConfigService } from '@nestjs/config';
import {
  normalizeRetentionDays,
  RequestLogRetentionService,
} from './request-log-retention.service';
import type { DrizzleDB } from '../../database/database.module';

describe('RequestLogRetentionService', () => {
  it('bounds retention configuration', () => {
    expect(normalizeRetentionDays(30)).toBe(30);
    expect(normalizeRetentionDays(0)).toBe(30);
    expect(normalizeRetentionDays(366)).toBe(30);
    expect(normalizeRetentionDays(undefined)).toBe(30);
  });

  it('returns the bounded delete count', async () => {
    const db = {
      execute: jest.fn().mockResolvedValue({
        rowCount: 25,
        rows: Array.from({ length: 25 }),
      }),
    } as unknown as DrizzleDB;
    const service = new RequestLogRetentionService(db, {
      get: jest.fn(() => 30),
    } as unknown as ConfigService);
    (service as unknown as { logger: { log: jest.Mock } }).logger.log =
      jest.fn();

    await expect(service.purgeExpiredRequestLogs()).resolves.toBe(25);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('fails open when cleanup cannot run', async () => {
    const db = {
      execute: jest.fn().mockRejectedValue(new Error('database unavailable')),
    } as unknown as DrizzleDB;
    const service = new RequestLogRetentionService(db, {
      get: jest.fn(() => 30),
    } as unknown as ConfigService);
    (service as unknown as { logger: { warn: jest.Mock } }).logger.warn =
      jest.fn();

    await expect(service.purgeExpiredRequestLogs()).resolves.toBe(0);
  });
});
