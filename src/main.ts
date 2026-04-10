import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { runMigrations } from './database/migration.runner';
import { configureApp } from './setup-app';

async function bootstrap() {
  // We initialize the app first to ensure Railway sees the port as "active" immediately.
  // Migrations are moved to background to avoid blocking the initial 500 error on cold starts.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  configureApp(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`NSW Transport API running on: http://localhost:${port}`);

  // Run migrations in the background
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl && process.env.RUN_MIGRATIONS_ON_STARTUP !== 'false') {
    runMigrations(databaseUrl, {
      maxRetries: parseInt(process.env.MIGRATION_MAX_RETRIES ?? '4', 10),
      retryDelayMs: parseInt(process.env.MIGRATION_RETRY_DELAY_MS ?? '3000', 10),
    }).catch((err) => {
      console.error('Background migration failed:', err);
    });
  }

  console.log(`REST docs: http://localhost:${port}/api/docs`);
  console.log(`GraphQL: http://localhost:${port}/graphql`);
}
void bootstrap();
