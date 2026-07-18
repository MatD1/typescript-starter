import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TransportService } from './transport.service';
import { GtfsRealtimeService } from './gtfs-realtime.service';
import { TfnswHttpClient } from './tfnsw-http.client';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30_000,
      maxRedirects: 3,
    }),
  ],
  providers: [TfnswHttpClient, TransportService, GtfsRealtimeService],
  exports: [TfnswHttpClient, TransportService, GtfsRealtimeService],
})
export class TransportModule {}
