import { Test, TestingModule } from '@nestjs/testing';
import { DRIZZLE } from '../database/database.module';
import { LineHealthAlertsService } from './line-health-alerts.service';

describe('LineHealthAlertsService.resolveManually', () => {
  let service: LineHealthAlertsService;
  let mockDb: { update: jest.Mock };

  beforeEach(async () => {
    mockDb = { update: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LineHealthAlertsService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get(LineHealthAlertsService);
  });

  it('returns true when an open alert for the line was resolved', async () => {
    mockDb.update.mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 1 }]),
        }),
      }),
    });

    await expect(service.resolveManually('T1')).resolves.toBe(true);
  });

  it('returns false when the line has no open alert', async () => {
    mockDb.update.mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
      }),
    });

    await expect(service.resolveManually('T1')).resolves.toBe(false);
  });
});
