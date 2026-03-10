import { runMigrations } from './migration.runner';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  try {
    await runMigrations(databaseUrl, {
      maxRetries: parseInt(process.env.MIGRATION_MAX_RETRIES ?? '4', 10),
      retryDelayMs: parseInt(process.env.MIGRATION_RETRY_DELAY_MS ?? '3000', 10),
    });
    console.log('Migrations completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

void main();
