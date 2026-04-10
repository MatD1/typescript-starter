import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as path from 'path';

const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_RETRY_DELAY_MS = 3000;

export async function runMigrations(
  databaseUrl: string,
  options?: { maxRetries?: number; retryDelayMs?: number },
): Promise<void> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelayMs = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const pool = new Pool({ connectionString: databaseUrl });
    const db = drizzle(pool);
    try {
      await migrate(db, {
        migrationsFolder: process.env.LAMBDA_TASK_ROOT
          ? path.join(process.env.LAMBDA_TASK_ROOT, 'drizzle')
          : path.join(__dirname, '../../../drizzle'),
      });

      await pool.end();
      return;
    } catch (err) {
      lastError = err;
      await pool.end().catch(() => { });
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }
  }
  throw lastError;
}
