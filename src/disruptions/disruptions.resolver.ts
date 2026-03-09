import { Args, Query, Resolver } from '@nestjs/graphql';
import { DisruptionsService } from './disruptions.service';
import { DisruptionObject } from './dto/disruption.object';
import { TransportModeEnum } from '../transport/transport.types';

@Resolver()
export class DisruptionsResolver {
  constructor(private readonly disruptionsService: DisruptionsService) {}

  @Query(() => [DisruptionObject], {
    description: 'Get current service disruptions and alerts.',
  })
  disruptions(
    @Args('mode', { type: () => TransportModeEnum, nullable: true })
    mode?: TransportModeEnum,
    @Args('effect', { type: () => String, nullable: true }) effect?: string,
  ) {
    return this.disruptionsService.getDisruptions(mode, effect);
  }
}
