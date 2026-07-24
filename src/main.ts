import { NestFactory } from '@nestjs/core';
import { ConsoleLogger } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { runMigrations } from './database/migration.runner';
import { configureApp } from './setup-app';

async function bootstrap() {
  // We initialize the app first to ensure Railway sees the port as "active" immediately.
  // Migrations are moved to background to avoid blocking the initial 500 error on cold starts.
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);

  configureApp(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`NSW Transport API running on: http://localhost:${port}`);

  // Run migrations in the background
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl && process.env.RUN_MIGRATIONS_ON_STARTUP !== 'false') {
    runMigrations(databaseUrl, {
      maxRetries: parseInt(process.env.MIGRATION_MAX_RETRIES ?? '4', 10),
      retryDelayMs: parseInt(
        process.env.MIGRATION_RETRY_DELAY_MS ?? '3000',
        10,
      ),
    }).catch((err) => {
      logger.error(
        'Background migration failed',
        err instanceof Error ? err.stack : String(err),
      );
    });
  }

  logger.log(`REST docs: http://localhost:${port}/api/docs`);
  logger.log(`GraphQL: http://localhost:${port}/graphql`);
}
void bootstrap().catch((error: unknown) => {
  const fallback = new ConsoleLogger('Bootstrap', { json: true });
  fallback.error(
    error instanceof Error ? error.message : String(error),
    error instanceof Error ? error.stack : undefined,
  );
  process.exitCode = 1;
});
