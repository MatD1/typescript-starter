/**
 * NSW-extended GTFS-RT interfaces.
 * These are the shapes returned by GtfsRealtimeService after decoding
 * with the TfNSW extension proto (field 1007).
 */

export interface CarriageDescriptor {
  name?: string;
  positionInConsist: number;
  occupancyStatus?: string;
  quietCarriage?: boolean;
  toilet?: string;
  luggageRack?: boolean;
  departureOccupancyStatus?: string;
}

export interface TfnswVehicleDescriptor {
  airConditioned?: boolean;
  wheelchairAccessible?: number;
  vehicleModel?: string;
  performingPriorTrip?: boolean;
  specialVehicleAttributes?: number;
}

export interface VehiclePosition {
  vehicleId: string;
  tripId?: string;
  routeId?: string;
  directionId?: number;
  startDate?: string;
  startTime?: string;
  tripScheduleRelationship?: string;
  latitude: number;
  longitude: number;
  bearing?: number;
  odometer?: number;
  speed?: number;
  currentStopSequence?: number;
  currentStopId?: string;
  currentStatus?: string;
  timestamp?: number;
  congestionLevel?: string;
  occupancyStatus?: string;
  trackDirection?: string;
  /** Vehicle label (e.g. set number) */
  vehicleLabel?: string;
  vehicleModel?: string;
  airConditioned?: boolean;
  wheelchairAccessible?: number;
  performingPriorTrip?: boolean;
  specialVehicleAttributes?: number;
  /** Per-carriage composition with occupancy / amenity data */
  consist?: CarriageDescriptor[];
}

export interface StopTimeUpdate {
  stopSequence?: number;
  stopId?: string;
  arrivalDelay?: number;
  arrivalTime?: number;
  departureDelay?: number;
  departureTime?: number;
  scheduleRelationship?: string;
  departureOccupancyStatus?: string;
  /** Predictive per-carriage occupancy at this stop */
  carriagePredictiveOccupancy?: CarriageDescriptor[];
}

export interface TripUpdate {
  tripId: string;
  routeId?: string;
  vehicleId?: string;
  vehicleLabel?: string;
  directionId?: number;
  startDate?: string;
  startTime?: string;
  scheduleRelationship?: string;
  stopTimeUpdates: StopTimeUpdate[];
  timestamp?: number;
  /** Overall trip delay in seconds */
  delay?: number;
}

export interface ServiceAlert {
  id: string;
  headerText?: string;
  descriptionText?: string;
  ttsHeaderText?: string;
  ttsDescriptionText?: string;
  url?: string;
  cause?: string;
  effect?: string;
  /** Severity level: UNKNOWN_SEVERITY | INFO | WARNING | SEVERE */
  severityLevel?: string;
  activePeriods: Array<{ start?: number; end?: number }>;
  informedEntities: Array<{
    agencyId?: string;
    routeId?: string;
    routeType?: number;
    stopId?: string;
    tripId?: string;
    directionId?: number;
  }>;
}
