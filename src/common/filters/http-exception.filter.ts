import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { GqlContextType } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { AuditContextService } from '../../audit/audit.context';
import { sanitizeAuditText } from '../../audit/audit.redaction';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly auditContext: AuditContextService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType<GqlContextType>() === 'graphql') {
      const status =
        exception instanceof HttpException
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
      const message =
        exception instanceof HttpException
          ? exception.message
          : exception instanceof Error
            ? exception.message
            : 'Internal server error';
      const code =
        status === HttpStatus.UNAUTHORIZED
          ? 'UNAUTHENTICATED'
          : status === HttpStatus.FORBIDDEN
            ? 'FORBIDDEN'
            : status === HttpStatus.BAD_REQUEST
              ? 'BAD_USER_INPUT'
              : status >= 500
                ? 'INTERNAL_SERVER_ERROR'
                : 'HTTP_ERROR';
      throw new GraphQLError(message, {
        extensions: { code, http: { status } },
      });
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string }).message ?? message);
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const requestId = this.auditContext.current()?.requestId;
    if (status >= 500) {
      this.logger.error(
        {
          err: exception,
          requestId,
          statusCode: status,
        },
        'REST request failed',
      );
    } else {
      this.logger.warn(
        {
          requestId,
          statusCode: status,
          errorMessage: sanitizeAuditText(message, 1000),
          errorType:
            exception instanceof Error ? exception.name : typeof exception,
        },
        'REST request rejected',
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
}
