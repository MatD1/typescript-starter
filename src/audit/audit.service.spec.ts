import { BadRequestException } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditContextService } from './audit.context';
import { CacheService } from '../cache/cache.service';
import { AUDIT_ACTIONS, AuditEventInput } from './audit.types';

function insertChain(result: unknown[] | Error) {
  const returning = jest.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  const onConflictDoNothing = jest.fn(() => ({ returning }));
  const values = jest.fn(() => ({ onConflictDoNothing }));
  return { values, onConflictDoNothing, returning };
}

describe('AuditService write policies', () => {
  const baseEvent: AuditEventInput = {
    category: 'api_key',
    action: AUDIT_ACTIONS.API_KEY_CREATED,
    outcome: 'succeeded',
    targetType: 'api_key',
    targetId: 'key-1',
  };

  it('sanitizes values and merges request context before persistence', async () => {
    const chain = insertChain([{ id: 'event-1' }]);
    const db = { insert: jest.fn(() => ({ values: chain.values })) };
    const context = {
      current: jest.fn(() => ({
        requestId: 'request-1',
        source: 'rest',
        method: 'POST',
        route: '/api/v1/api-keys',
        actor: { type: 'user', id: 'user-1', role: 'user' },
      })),
    };
    const service = new AuditService(
      db as any,
      context as unknown as AuditContextService,
      {} as CacheService,
    );

    await service.record({
      ...baseEvent,
      metadata: {
        safe: 'value',
        refreshToken: 'must-never-be-stored',
      },
    });

    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        actorRole: 'user',
        requestId: 'request-1',
        metadata: {
          safe: 'value',
          refreshToken: '[REDACTED]',
        },
      }),
    );
  });

  it('fails closed before a high-risk event without a valid reason', async () => {
    const db = { insert: jest.fn() };
    const service = new AuditService(
      db as any,
      { current: jest.fn() } as unknown as AuditContextService,
      {} as CacheService,
    );

    await expect(
      service.record({
        category: 'administration',
        action: AUDIT_ACTIONS.ADMIN_USER_DELETED,
        outcome: 'attempted',
        targetType: 'user',
        targetId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('supplies a traceable reason for automatic high-risk system events', async () => {
    const chain = insertChain([{ id: 'event-1' }]);
    const db = { insert: jest.fn(() => ({ values: chain.values })) };
    const service = new AuditService(
      db as any,
      { current: jest.fn() } as unknown as AuditContextService,
      {} as CacheService,
    );

    await service.record({
      category: 'gtfs',
      action: AUDIT_ACTIONS.GTFS_INGEST_ATTEMPTED,
      outcome: 'attempted',
      actor: { type: 'system', id: 'gtfs-scheduler' },
      source: 'job',
    });

    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Automatic backend operation: gtfs.ingest.attempted',
      }),
    );
  });

  it('propagates transactional insert failures to roll back the mutation', async () => {
    const chain = insertChain(new Error('audit unavailable'));
    const tx = { insert: jest.fn(() => ({ values: chain.values })) };
    const service = new AuditService(
      {} as any,
      { current: jest.fn() } as unknown as AuditContextService,
      {} as CacheService,
    );

    await expect(
      service.recordInTransaction(tx as any, baseEvent),
    ).rejects.toThrow('audit unavailable');
  });

  it('queues best-effort events when PostgreSQL is unavailable', async () => {
    const chain = insertChain(new Error('database unavailable'));
    const db = { insert: jest.fn(() => ({ values: chain.values })) };
    const cache = {
      enqueueAuditEvent: jest.fn().mockResolvedValue('1-0'),
    };
    const service = new AuditService(
      db as any,
      { current: jest.fn() } as unknown as AuditContextService,
      cache as unknown as CacheService,
    );

    await service.recordBestEffort(baseEvent);
    expect(cache.enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.API_KEY_CREATED,
        id: expect.any(String),
      }),
    );
  });
});
