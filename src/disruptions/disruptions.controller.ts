import { Controller, Get, Query, ParseEnumPipe } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { DisruptionsService } from './disruptions.service';
import { TRANSPORT_MODES, TransportModeEnum } from '../transport/transport.types';
import type { TransportMode } from '../transport/transport.types';
import { DisruptionSwagger } from '../realtime/dto/realtime.swagger-schemas';

@ApiTags('disruptions')
@ApiSecurity('X-API-Key')
@ApiExtraModels(DisruptionSwagger)
@Controller('disruptions')
export class DisruptionsController {
  constructor(private readonly disruptionsService: DisruptionsService) { }

  @Get()
  @ApiOperation({
    summary: 'Get current service disruptions and alerts',
    description:
      'Returns active GTFS-RT service alerts for all or a specific transport mode. ' +
      'Alerts include full-route closures, detours, reduced service, and other disruptions. ' +
      'Results are cached and refreshed from TfNSW periodically. ' +
      'Filter by `effect` to show only specific alert types — common values: ' +
      '`NO_SERVICE`, `REDUCED_SERVICE`, `SIGNIFICANT_DELAYS`, `DETOUR`, `MODIFIED_SERVICE`.',
  })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: TRANSPORT_MODES,
    description: 'Transport mode filter (e.g. sydneytrains, buses). Omit for all modes.',
  })
  @ApiQuery({
    name: 'effect',
    required: false,
    description:
      'Filter by disruption effect type. Accepted values: ' +
      'NO_SERVICE, REDUCED_SERVICE, SIGNIFICANT_DELAYS, DETOUR, ADDITIONAL_SERVICE, MODIFIED_SERVICE, OTHER_EFFECT, UNKNOWN_EFFECT, STOP_MOVED',
  })
  @ApiOkResponse({
    type: [DisruptionSwagger],
    description: 'Array of active service disruptions, ordered by active period start descending',
  })
  getDisruptions(
    @Query('mode', new ParseEnumPipe(TransportModeEnum, { optional: true }))
    mode?: TransportMode,
    @Query('effect') effect?: string,
  ) {
    return this.disruptionsService.getDisruptions(mode, effect);
  }
}
