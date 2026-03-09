import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import {
  fieldExtensionsEstimator,
  getComplexity,
  simpleEstimator,
} from 'graphql-query-complexity';
import { GraphQLError } from 'graphql';
import { join } from 'path';

import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { AuthModule } from './auth/auth.module';
import { TransportModule } from './transport/transport.module';
import { RealtimeModule } from './realtime/realtime.module';
import { TripPlannerModule } from './trip-planner/trip-planner.module';
import { StationsModule } from './stations/stations.module';
import { DisruptionsModule } from './disruptions/disruptions.module';
import { GtfsStaticModule } from './gtfs-static/gtfs-static.module';
import { AdminModule } from './admin/admin.module';

import { ApiKeyGuard } from './auth/guards/api-key.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RequestLogInterceptor } from './common/interceptors/request-log.interceptor';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { CacheControlInterceptor } from './common/interceptors/cache-control.interceptor';

const MAX_QUERY_COMPLEXITY = 1000;
const MAX_QUERY_DEPTH = 8;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 60_000, limit: 120 }],
        storage: new ThrottlerStorageRedisService(
          config.get<string>('redis.url') ?? 'redis://localhost:6379',
        ),
      }),
    }),
    DatabaseModule,
    CacheModule,
    AuthModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: process.env.NODE_ENV !== 'production',
      introspection: process.env.NODE_ENV !== 'production',
      persistedQueries: {},
      context: ({ req }: { req: Request }) => ({ req }),
      plugins: [
        {
          // eslint-disable-next-line @typescript-eslint/require-await
          async requestDidStart() {
            return {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              async didResolveOperation(ctx: any) {
                const complexity = getComplexity({
                  schema: ctx.schema,
                  query: ctx.document,
                  variables: ctx.request?.variables,
                  estimators: [
                    fieldExtensionsEstimator(),
                    simpleEstimator({ defaultComplexity: 1 }),
                  ],
                });
                if (complexity > MAX_QUERY_COMPLEXITY) {
                  throw new GraphQLError(
                    `Query complexity ${complexity} exceeds maximum of ${MAX_QUERY_COMPLEXITY}.`,
                    { extensions: { code: 'QUERY_TOO_COMPLEX' } },
                  );
                }
              },
            };
          },
        },
      ],
      validationRules: [
        (context) => {
          let depth = 0;
          return {
            Field: {
              enter() {
                depth++;
                if (depth > MAX_QUERY_DEPTH) {
                  context.reportError(
                    new GraphQLError(
                      `Query depth ${depth} exceeds maximum of ${MAX_QUERY_DEPTH}.`,
                      { extensions: { code: 'QUERY_TOO_DEEP' } },
                    ),
                  );
                }
              },
              leave() {
                depth--;
              },
            },
          };
        },
      ],
    }),
    TransportModule,
    RealtimeModule,
    TripPlannerModule,
    StationsModule,
    DisruptionsModule,
    GtfsStaticModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestLogInterceptor },
    { provide: APP_INTERCEPTOR, useClass: CacheControlInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
