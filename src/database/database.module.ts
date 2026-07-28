import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as authSchema from './schema/auth.schema';
import * as gtfsSchema from './schema/gtfs.schema';
import * as requestLogSchema from './schema/request-log.schema';
import * as historySchema from './schema/history.schema';
import * as pushSchema from './schema/push.schema';
import * as auditSchema from './schema/audit.schema';

export const DRIZZLE = Symbol('DRIZZLE');

const schema = {
  ...authSchema,
  ...gtfsSchema,
  ...requestLogSchema,
  ...historySchema,
  ...pushSchema,
  ...auditSchema,
};

export type AppSchema = typeof schema;
export type DrizzleDB = NodePgDatabase<AppSchema>;

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): DrizzleDB => {
        const pool = new Pool({
          connectionString: configService.get<string>('database.url'),
          // This is a single long-running Railway process, not a serverless
          // function — a pool of 1 starves under any concurrent load (e.g.
          // many devices paging through the full stops catalog at once) and
          // causes connection-acquisition timeouts under the misleading
          // "Failed query" label from GlobalExceptionFilter.
          //
          // Dropped back down from 10 (each idle Postgres backend has a real
          // baseline memory cost) now that GTFS static reads are cached in
          // Redis/Valkey and the stop_times cleanup removed the query
          // pressure that originally required a bigger pool. Idle timeout
          // shortened too, so connections don't sit around unused for long
          // between this single-user app's bursts of activity.
          max: 4,
          idleTimeoutMillis: 10000,
          connectionTimeoutMillis: 5000,
        });
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule { }
