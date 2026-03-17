import { Controller, Get, Query, ParseEnumPipe } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { DisruptionsService } from './disruptions.service';
import { TRANSPORT_MODES, TransportModeEnum } from '../transport/transport.types';
import type { TransportMode } from '../transport/transport.types';

@ApiTags('disruptions')
@ApiSecurity('X-API-Key')
@Controller('disruptions')
export class DisruptionsController {
  constructor(private readonly disruptionsService: DisruptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get current service disruptions and alerts' })
  @ApiQuery({ name: 'mode', required: false, enum: TRANSPORT_MODES })
  @ApiQuery({
    name: 'effect',
    required: false,
    description:
      'Filter by effect type (e.g. DETOUR, REDUCED_SERVICE, NO_SERVICE)',
  })
  getDisruptions(
    @Query('mode', new ParseEnumPipe(TransportModeEnum, { optional: true }))
    mode?: TransportMode,
    @Query('effect') effect?: string,
  ) {
    return this.disruptionsService.getDisruptions(mode, effect);
  }
}
