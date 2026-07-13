import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { GqlArgumentsHost, GqlContextType } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

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
      const stack = exception instanceof Error ? exception.stack : undefined;
      if (status >= 500) {
        this.logger.error(
          `GraphQL error: ${message}`,
          stack ?? String(exception),
        );
      } else {
        this.logger.warn(`GraphQL request rejected [${status}]: ${message}`);
      }
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
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error('Unknown exception', JSON.stringify({ exception }));
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
