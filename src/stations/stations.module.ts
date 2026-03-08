import { Module } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationsController } from './stations.controller';
import { StationsResolver } from './stations.resolver';

@Module({
  controllers: [StationsController],
  providers: [StationsService, StationsResolver],
})
export class StationsModule {}
