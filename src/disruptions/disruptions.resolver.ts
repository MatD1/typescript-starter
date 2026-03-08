import { Args, Query, Resolver } from '@nestjs/graphql';
import { DisruptionsService } from './disruptions.service';
import { DisruptionObject } from './dto/disruption.object';
import type { TransportMode } from '../transport/transport.types';

@Resolver()
export class DisruptionsResolver {
  constructor(private readonly disruptionsService: DisruptionsService) {}

  @Query(() => [DisruptionObject], {
    description: 'Get current service disruptions and alerts.',
  })
  disruptions(
    @Args('mode', { type: () => String, nullable: true }) mode?: TransportMode,
    @Args('effect', { type: () => String, nullable: true }) effect?: string,
  ) {
    return this.disruptionsService.getDisruptions(mode, effect);
  }
}
