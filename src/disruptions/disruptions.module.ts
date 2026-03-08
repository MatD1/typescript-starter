import { Module } from '@nestjs/common';
import { TransportModule } from '../transport/transport.module';
import { DisruptionsService } from './disruptions.service';
import { DisruptionsController } from './disruptions.controller';
import { DisruptionsResolver } from './disruptions.resolver';

@Module({
  imports: [TransportModule],
  controllers: [DisruptionsController],
  providers: [DisruptionsService, DisruptionsResolver],
})
export class DisruptionsModule {}
