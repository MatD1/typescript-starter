import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditController } from '../src/audit/audit.controller';
import { AuditService } from '../src/audit/audit.service';
import { AuditExportService } from '../src/audit/audit.export.service';
import { AuditArchiveService } from '../src/audit/audit.archive.service';
import { AdminGuard } from '../src/auth/guards/admin.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { ApiKeyService } from '../src/auth/api-key.service';
import { DRIZZLE } from '../src/database/database.module';

describe('admin audit API (e2e)', () => {
  let app: INestApplication;

  const audit = {
    query: jest.fn().mockResolvedValue({ data: [], nextCursor: undefined }),
    summary: jest.fn().mockResolvedValue([]),
    getById: jest.fn().mockResolvedValue({
      id: 'event-1',
      sequence: 1,
      occurredAt: new Date(),
    }),
    listArchives: jest.fn().mockResolvedValue([]),
    record: jest.fn().mockResolvedValue({ id: 'access-event' }),
    recordBestEffort: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        AdminGuard,
        RolesGuard,
        Reflector,
        { provide: AuditService, useValue: audit },
        {
          provide: AuditExportService,
          useValue: {
            create: jest.fn(),
            get: jest.fn(),
            download: jest.fn(),
          },
        },
        {
          provide: AuditArchiveService,
          useValue: { verify: jest.fn() },
        },
        {
          provide: ApiKeyService,
          useValue: {
            resolveUserFromBearer: jest.fn(async (token: string) => {
              if (token === 'admin-token') {
                return { userId: 'admin-1', role: 'admin', banned: false };
              }
              if (token === 'user-token') {
                return { userId: 'user-1', role: 'user', banned: false };
              }
              if (token === 'banned-admin-token') {
                return { userId: 'admin-2', role: 'admin', banned: true };
              }
              return null;
            }),
          },
        },
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => app.close());

  it('allows a live administrator session to query events', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/audit-events')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect({ data: [] });
  });

  it.each([
    ['without a session', undefined],
    ['for a normal user', 'Bearer user-token'],
    ['for a banned admin', 'Bearer banned-admin-token'],
    ['for an API key', 'Bearer nsw_not_allowed'],
  ])('rejects audit access %s', async (_label, authorization) => {
    const req = request(app.getHttpServer()).get(
      '/api/v1/admin/audit-events',
    );
    if (authorization) req.set('Authorization', authorization);
    await req.expect(403);
  });

  it('validates audit filters before querying', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/audit-events?actorType=invalid')
      .set('Authorization', 'Bearer admin-token')
      .expect(400);
  });

  it('returns one event and audits the access', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/audit-events/event-1')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe('event-1');
      });
    expect(audit.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'audit.event.viewed',
        targetId: 'event-1',
      }),
    );
  });
});
