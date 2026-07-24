import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';
import { GraphQLError } from 'graphql';
import { AuditContextService } from '../../audit/audit.context';
import { GlobalExceptionFilter } from './http-exception.filter';

describe('GlobalExceptionFilter logging ownership', () => {
  let auditContext: AuditContextService;
  let filter: GlobalExceptionFilter;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    auditContext = new AuditContextService();
    filter = new GlobalExceptionFilter(auditContext);
    const logger = (
      filter as unknown as {
        logger: {
          warn: (...args: unknown[]) => void;
          error: (...args: unknown[]) => void;
        };
      }
    ).logger;
    warn = jest.spyOn(logger, 'warn').mockImplementation();
    error = jest.spyOn(logger, 'error').mockImplementation();
  });

  it('leaves GraphQL console logging to Apollo', () => {
    const host = {
      getType: () => 'graphql',
    } as unknown as ArgumentsHost;

    expect(() =>
      filter.catch(new BadRequestException('bad query'), host),
    ).toThrow(GraphQLError);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('logs a REST rejection once with its request ID', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const response = { status, json } as unknown as Response;
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    auditContext.run(
      {
        requestId: 'request-123',
        source: 'rest',
        actor: { type: 'anonymous' },
      },
      () => filter.catch(new BadRequestException('bad request'), host),
    );

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-123',
        statusCode: 400,
        errorMessage: 'bad request',
      }),
      'REST request rejected',
    );
    expect(error).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-123' }),
    );
  });
});
