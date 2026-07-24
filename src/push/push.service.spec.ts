import { Test, TestingModule } from '@nestjs/testing';
import { DRIZZLE } from '../database/database.module';
import { CacheService } from '../cache/cache.service';
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
  let mockCache: {
    get: jest.Mock;
    set: jest.Mock;
    consumeOnce: jest.Mock;
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

    mockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      consumeOnce: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: CacheService, useValue: mockCache },
      ],
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

  describe('createDeviceLinkCode / redeemDeviceLinkCode', () => {
    it('creates an 8-character code and stores it against the admin userId', async () => {
      const result = await service.createDeviceLinkCode('admin-1');

      expect(result.code).toHaveLength(8);
      expect(result.expiresInSeconds).toBe(300);
      expect(mockCache.set).toHaveBeenCalledWith(
        `push:link-code:${result.code}`,
        { userId: 'admin-1' },
        300,
      );
    });

    it('redeems a valid code by registering the device to the claimed userId', async () => {
      mockCache.consumeOnce.mockResolvedValue({ userId: 'admin-1' });

      const result = await service.redeemDeviceLinkCode('ABCD1234', 'token-xyz', 'android');

      expect(result).toEqual({ userId: 'admin-1' });
      expect(mockCache.consumeOnce).toHaveBeenCalledWith('push:link-code:ABCD1234');
      expect(mockDb.insert).toHaveBeenCalled();
      const valuesCall = mockDb.insert.mock.results[0].value.values as jest.Mock;
      expect(valuesCall).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'admin-1', fcmToken: 'token-xyz', platform: 'android' }),
      );
    });

    it('is case/whitespace-insensitive and normalizes before lookup', async () => {
      mockCache.consumeOnce.mockResolvedValue({ userId: 'admin-1' });

      await service.redeemDeviceLinkCode('  abcd1234  ', 'token-xyz');

      expect(mockCache.consumeOnce).toHaveBeenCalledWith('push:link-code:ABCD1234');
    });

    it('rejects an invalid or already-used code', async () => {
      mockCache.consumeOnce.mockResolvedValue(null);

      await expect(
        service.redeemDeviceLinkCode('BADCODE1', 'token-xyz'),
      ).rejects.toThrow('Invalid or expired code');
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });
});
