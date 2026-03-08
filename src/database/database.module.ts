import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as authSchema from './schema/auth.schema';
import * as gtfsSchema from './schema/gtfs.schema';

export const DRIZZLE = Symbol('DRIZZLE');

const schema = { ...authSchema, ...gtfsSchema };

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
        });
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
