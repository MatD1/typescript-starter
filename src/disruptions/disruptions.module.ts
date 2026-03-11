import { Module } from '@nestjs/common';
import { TransportModule } from '../transport/transport.module';
import { GtfsStaticModule } from '../gtfs-static/gtfs-static.module';
import { DisruptionsService } from './disruptions.service';
import { DisruptionsController } from './disruptions.controller';
import { DisruptionsResolver } from './disruptions.resolver';

@Module({
  imports: [TransportModule, GtfsStaticModule],
  controllers: [DisruptionsController],
  providers: [DisruptionsService, DisruptionsResolver],
})
export class DisruptionsModule {}
