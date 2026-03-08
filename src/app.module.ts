import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
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

import { ApiKeyGuard } from './auth/guards/api-key.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    CacheModule,
    AuthModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: true,
      context: ({ req }: { req: Request }) => ({ req }),
    }),
    TransportModule,
    RealtimeModule,
    TripPlannerModule,
    StationsModule,
    DisruptionsModule,
    GtfsStaticModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
