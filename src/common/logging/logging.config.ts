import type { IncomingMessage, ServerResponse } from 'http';
import type { LevelWithSilent } from 'pino';
import { stdSerializers, stdTimeFunctions } from 'pino';
import type { Params } from 'nestjs-pino';
import { resolveRequestId } from './request-id';

const LOG_LEVEL_ALIASES: Record<string, LevelWithSilent> = {
  verbose: 'trace',
  log: 'info',
};
const LOG_LEVELS = new Set<LevelWithSilent>([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);

export function resolveLogLevel(
  env: NodeJS.ProcessEnv = process.env,
): LevelWithSilent {
  const configured = env.LOG_LEVEL?.trim().toLowerCase();
  if (configured) {
    const aliased = LOG_LEVEL_ALIASES[configured] ?? configured;
    if (LOG_LEVELS.has(aliased as LevelWithSilent)) {
      return aliased as LevelWithSilent;
    }
  }
  return env.NODE_ENV === 'production' ? 'info' : 'debug';
}

export function createLoggerParams(
  env: NodeJS.ProcessEnv = process.env,
): Params {
  const production = env.NODE_ENV === 'production';
  const base = Object.fromEntries(
    Object.entries({
      service: env.RAILWAY_SERVICE_NAME ?? 'jrail-api',
      environment:
        env.RAILWAY_ENVIRONMENT_NAME ?? env.NODE_ENV ?? 'development',
      version: env.RAILWAY_GIT_COMMIT_SHA ?? env.npm_package_version,
    }).filter(([, value]) => Boolean(value)),
  );

  return {
    pinoHttp: {
      level: resolveLogLevel(env),
      autoLogging: false,
      messageKey: 'message',
      timestamp: stdTimeFunctions.isoTime,
      base,
      formatters: {
        level: (label) => ({ level: label }),
      },
      transport: production
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'SYS:standard',
            },
          },
      genReqId: (
        req: IncomingMessage,
        res: ServerResponse<IncomingMessage>,
      ) => {
        const requestId = resolveRequestId(req.headers['x-request-id']);
        res.setHeader('X-Request-ID', requestId);
        return requestId;
      },
      wrapSerializers: false,
      serializers: {
        req: (req: IncomingMessage) => ({
          id: req.id,
          method: req.method,
          route: req.url?.split('?', 1)[0],
        }),
        err: stdSerializers.err,
      },
      redact: {
        paths: [
          'req.headers',
          'headers',
          '*.authorization',
          '*.cookie',
          '*.password',
          '*.secret',
          '*.token',
          '*.apiKey',
          '*.api_key',
        ],
        censor: '[REDACTED]',
      },
    },
  };
}
