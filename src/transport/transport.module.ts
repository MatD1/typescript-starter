import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TransportService } from './transport.service';
import { GtfsRealtimeService } from './gtfs-realtime.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        baseURL: configService.get<string>('transport.baseUrl'),
        timeout: 10000,
        headers: {
          Authorization: `apikey ${configService.get<string>('transport.apiKey')}`,
        },
      }),
    }),
  ],
  providers: [TransportService, GtfsRealtimeService],
  exports: [TransportService, GtfsRealtimeService],
})
export class TransportModule {}
