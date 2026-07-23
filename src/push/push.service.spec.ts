import { Test, TestingModule } from '@nestjs/testing';
import { DRIZZLE } from '../database/database.module';
import { PushService } from './push.service';

const mockSendEachForMulticast = jest.fn();
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ sendEachForMulticast: mockSendEachForMulticast }),
}));
jest.mock('firebase-admin/app', () => ({
  cert: jest.fn(),
  getApps: () => [],
  initializeApp: jest.fn(),
}));

describe('PushService', () => {
  let service: PushService;
  let mockDb: {
    select: jest.Mock;
    insert: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    mockSendEachForMulticast.mockReset();

    mockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      delete: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PushService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get(PushService);
    // Bypass the FIREBASE_SERVICE_ACCOUNT env check — exercise the send
    // logic itself, not the init gate (that's covered by onModuleInit).
    (service as unknown as { enabled: boolean }).enabled = true;
  });

  describe('registerDeviceToken', () => {
    it('upserts the token keyed on the unique fcmToken column', async () => {
      await service.registerDeviceToken('user-1', 'token-abc', 'ios');

      expect(mockDb.insert).toHaveBeenCalled();
      const valuesCall = mockDb.insert.mock.results[0].value.values as jest.Mock;
      expect(valuesCall).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', fcmToken: 'token-abc', platform: 'ios' }),
      );
    });
  });

  describe('sendToUser', () => {
    it('returns zero sent when the user has no registered devices', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      });

      const result = await service.sendToUser('user-1', 'Title', 'Body');

      expect(result).toEqual({ sent: 0, pruned: 0 });
      expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    });

    it('sends to every registered device and reports the success count', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ fcmToken: 't1' }, { fcmToken: 't2' }]),
      });
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 2,
        responses: [{ success: true }, { success: true }],
      });

      const result = await service.sendToUser('user-1', 'Title', 'Body');

      expect(result).toEqual({ sent: 2, pruned: 0 });
      expect(mockSendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({ tokens: ['t1', 't2'] }),
      );
    });

    it('prunes tokens FCM reports as unregistered', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ fcmToken: 'dead' }, { fcmToken: 'alive' }]),
      });
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 1,
        responses: [
          { success: false, error: { code: 'messaging/registration-token-not-registered' } },
          { success: true },
        ],
      });

      const result = await service.sendToUser('user-1', 'Title', 'Body');

      expect(result).toEqual({ sent: 1, pruned: 1 });
      expect(mockDb.delete).toHaveBeenCalledTimes(1);
    });

    it('does nothing when push is disabled', async () => {
      (service as unknown as { enabled: boolean }).enabled = false;
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ fcmToken: 't1' }]),
      });

      const result = await service.sendToUser('user-1', 'Title', 'Body');

      expect(result).toEqual({ sent: 0, pruned: 0 });
      expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    });
  });
});
