import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── Vehicle Position ─────────────────────────────────────────────────────────

export class CarriageSwagger {
    @ApiProperty({ description: 'Position (1-based) in the consist set' })
    positionInConsist!: number;

    @ApiPropertyOptional({
        description:
            'Occupancy status: EMPTY, MANY_SEATS_AVAILABLE, FEW_SEATS_AVAILABLE, STANDING_ROOM_ONLY, CRUSHED_STANDING_ROOM_ONLY, FULL, NOT_ACCEPTING_PASSENGERS',
    })
    occupancyStatus?: string;

    @ApiPropertyOptional({ description: 'Whether this is a designated quiet carriage' })
    quietCarriage?: boolean;
}

export class VehiclePositionSwagger {
    @ApiProperty({ description: 'Unique vehicle identifier' })
    vehicleId!: string;

    @ApiPropertyOptional({ description: 'GTFS trip ID' })
    tripId?: string;

    @ApiPropertyOptional({ description: 'GTFS route ID (e.g. T1, BMT_1_ccn)' })
    routeId?: string;

    @ApiPropertyOptional({ description: 'Human-readable line code (e.g. T1, CCN)' })
    lineCode?: string;

    @ApiPropertyOptional({ description: 'Route colour hex without # (e.g. 009B77)' })
    routeColour?: string;

    @ApiPropertyOptional({ description: 'Direction: 0 = outbound, 1 = inbound' })
    directionId?: number;

    @ApiProperty({ description: 'WGS84 latitude' })
    latitude!: number;

    @ApiProperty({ description: 'WGS84 longitude' })
    longitude!: number;

    @ApiPropertyOptional({ description: 'Bearing in degrees (0 = north, clockwise)' })
    bearing?: number;

    @ApiPropertyOptional({ description: 'Speed in km/h' })
    speed?: number;

    @ApiPropertyOptional({
        description:
            'Position status: IN_TRANSIT_TO, STOPPED_AT, INCOMING_AT',
    })
    currentStatus?: string;

    @ApiPropertyOptional({ description: 'Stop ID the vehicle is at / heading towards' })
    currentStopId?: string;

    @ApiPropertyOptional({ description: 'Unix timestamp of the vehicle report (seconds)' })
    timestamp?: number;

    @ApiPropertyOptional({ description: 'Occupancy: EMPTY … FULL' })
    occupancyStatus?: string;

    @ApiProperty({ description: 'Transport mode (e.g. sydneytrains, buses)' })
    mode!: string;

    // TfNSW extension fields
    @ApiPropertyOptional({ description: 'Track direction relative to network: UP | DOWN' })
    trackDirection?: string;

    @ApiPropertyOptional({ description: 'Vehicle label / set number visible on the vehicle' })
    vehicleLabel?: string;

    @ApiPropertyOptional({ description: 'Rolling-stock model name' })
    vehicleModel?: string;

    @ApiPropertyOptional({ description: 'Whether the vehicle is air-conditioned' })
    airConditioned?: boolean;

    @ApiPropertyOptional({ description: '0 = unknown, 1 = accessible, 2 = not accessible' })
    wheelchairAccessible?: number;

    @ApiPropertyOptional({
        type: [CarriageSwagger],
        description: 'Per-carriage consist with occupancy and amenity data',
    })
    consist?: CarriageSwagger[];
}

// ─── Trip Update ──────────────────────────────────────────────────────────────

export class StopTimeUpdateSwagger {
    @ApiPropertyOptional({ description: 'GTFS stop ID' })
    stopId?: string;

    @ApiPropertyOptional({ description: 'Stop sequence number in the trip' })
    stopSequence?: number;

    @ApiPropertyOptional({ description: 'Arrival delay in seconds (negative = early)' })
    arrivalDelay?: number;

    @ApiPropertyOptional({ description: 'Departure delay in seconds (negative = early)' })
    departureDelay?: number;

    @ApiPropertyOptional({ description: 'Predicted occupancy at departure' })
    departureOccupancyStatus?: string;
}

export class TripUpdateSwagger {
    @ApiProperty({ description: 'GTFS trip ID' })
    tripId!: string;

    @ApiPropertyOptional({ description: 'GTFS route ID' })
    routeId?: string;

    @ApiPropertyOptional({ description: 'Human-readable line code' })
    lineCode?: string;

    @ApiPropertyOptional({ description: 'Overall trip delay in seconds (negative = early)' })
    delay?: number;

    @ApiPropertyOptional({ description: 'SCHEDULED | ADDED | CANCELED | UNSCHEDULED' })
    scheduleRelationship?: string;

    @ApiPropertyOptional({ description: 'Transport mode' })
    mode?: string;

    @ApiProperty({ type: [StopTimeUpdateSwagger] })
    stopTimeUpdates!: StopTimeUpdateSwagger[];
}

// ─── Track Trip ───────────────────────────────────────────────────────────────

export class TrackedTripSwagger {
    @ApiProperty({ description: 'GTFS trip ID' })
    tripId!: string;

    @ApiPropertyOptional({ description: 'GTFS route ID' })
    routeId?: string;

    @ApiPropertyOptional({ description: 'Human-readable line code' })
    lineCode?: string;

    @ApiPropertyOptional({ description: 'Route colour hex' })
    routeColour?: string;

    @ApiPropertyOptional({ description: 'Overall trip delay in seconds' })
    delay?: number;

    @ApiPropertyOptional({ description: 'SCHEDULED | ADDED | CANCELED' })
    scheduleRelationship?: string;

    @ApiProperty({ description: 'Transport mode' })
    mode!: string;

    @ApiPropertyOptional({ type: VehiclePositionSwagger, description: 'Current live position' })
    position?: VehiclePositionSwagger;

    @ApiPropertyOptional({ type: [StopTimeUpdateSwagger], description: 'Stop-level delay predictions' })
    stopTimeUpdates?: StopTimeUpdateSwagger[];

    // Amenity fields from the vehicle
    @ApiPropertyOptional()
    vehicleLabel?: string;

    @ApiPropertyOptional()
    vehicleModel?: string;

    @ApiPropertyOptional()
    airConditioned?: boolean;

    @ApiPropertyOptional()
    wheelchairAccessible?: number;

    @ApiPropertyOptional({ type: [CarriageSwagger] })
    consist?: CarriageSwagger[];
}

// ─── Headway ─────────────────────────────────────────────────────────────────

export class VehicleHeadwaySwagger {
    @ApiProperty({ description: 'Vehicle identifier' })
    vehicleId!: string;

    @ApiPropertyOptional({ description: 'Gap in seconds to the leading vehicle' })
    gapSeconds?: number;

    @ApiProperty({
        description:
            'Headway status classification. bunched < 3min, compressing 3–7min, healthy 7–15min, gapped > 15min',
        enum: ['bunched', 'compressing', 'healthy', 'gapped', 'unknown'],
    })
    status!: string;
}

export class RouteHeadwaySwagger {
    @ApiProperty({ description: 'GTFS route ID' })
    routeId!: string;

    @ApiPropertyOptional({ description: 'GTFS direction: 0 = outbound, 1 = inbound' })
    directionId?: number;

    @ApiProperty({ type: [VehicleHeadwaySwagger], description: 'Ordered list of vehicles on this route/direction' })
    vehicles!: VehicleHeadwaySwagger[];
}

// ─── Disruption ───────────────────────────────────────────────────────────────

export class DisruptionEntitySwagger {
    @ApiPropertyOptional({ description: 'Affected route ID' })
    routeId?: string;

    @ApiPropertyOptional({ description: 'Affected stop ID' })
    stopId?: string;

    @ApiPropertyOptional({ description: 'Trip ID' })
    tripId?: string;
}

export class DisruptionSwagger {
    @ApiProperty({ description: 'Alert ID' })
    id!: string;

    @ApiPropertyOptional({ description: 'Alert header / title' })
    headerText?: string;

    @ApiPropertyOptional({ description: 'Full alert description' })
    descriptionText?: string;

    @ApiPropertyOptional({
        description:
            'Effect type: NO_SERVICE, REDUCED_SERVICE, SIGNIFICANT_DELAYS, DETOUR, ADDITIONAL_SERVICE, MODIFIED_SERVICE, OTHER_EFFECT, UNKNOWN_EFFECT, STOP_MOVED',
    })
    effect?: string;

    @ApiPropertyOptional({ description: 'Cause of the disruption' })
    cause?: string;

    @ApiPropertyOptional({ description: 'URL for more information' })
    url?: string;

    @ApiPropertyOptional({ description: 'Active period start (Unix seconds)' })
    activePeriodStart?: number;

    @ApiPropertyOptional({ description: 'Active period end (Unix seconds)' })
    activePeriodEnd?: number;

    @ApiProperty({ type: [DisruptionEntitySwagger], description: 'Affected routes/stops/trips' })
    entities!: DisruptionEntitySwagger[];

    @ApiProperty({ description: 'Transport mode' })
    mode!: string;
}
