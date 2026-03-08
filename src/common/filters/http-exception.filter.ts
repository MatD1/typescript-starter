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
      const gqlHost = GqlArgumentsHost.create(host);
      void gqlHost;
      const message =
        exception instanceof HttpException
          ? exception.message
          : exception instanceof Error
            ? exception.message
            : 'Internal server error';
      throw new GraphQLError(message);
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
