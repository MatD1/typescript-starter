import * as protobuf from 'protobufjs';
import * as path from 'path';

let rootCache: protobuf.Root | null = null;

/**
 * Lazily loads the TfNSW GTFS-RT extension proto (field 1007) and caches
 * the result for the lifetime of the process.
 */
async function getNswProtoRoot(): Promise<protobuf.Root> {
  if (rootCache) return rootCache;
  const protoPath = path.join(__dirname, 'gtfs-realtime_1007_extension.proto');
  rootCache = await protobuf.load(protoPath);
  return rootCache;
}

/**
 * Decodes a raw GTFS-RT protobuf buffer using the full TfNSW extension schema.
 * Extension fields (1007) — consist, tfnsw_vehicle_descriptor, track_direction,
 * carriage_seq_predictive_occupancy — are decoded alongside standard fields.
 */
export async function decodeFeedMessage(buffer: Buffer): Promise<NswFeedMessage> {
  const root = await getNswProtoRoot();
  const FeedMessageType = root.lookupType('transit_realtime.FeedMessage');
  const decoded = FeedMessageType.decode(new Uint8Array(buffer));
  return FeedMessageType.toObject(decoded, {
    longs: Number,
    enums: String,
    defaults: false,
    arrays: true,
    objects: true,
    oneofs: true,
  }) as unknown as NswFeedMessage;
}

// ─── Typed shape returned by toObject() ─────────────────────────────────────

export interface NswFeedMessage {
  header: NswFeedHeader;
  entity: NswFeedEntity[];
}

export interface NswFeedHeader {
  gtfsRealtimeVersion: string;
  incrementality?: string;
  timestamp?: number;
}

export interface NswFeedEntity {
  id: string;
  isDeleted?: boolean;
  tripUpdate?: NswTripUpdate;
  vehicle?: NswVehiclePosition;
  alert?: NswAlert;
  /** Extension 1007: static bundle update notification */
  update?: NswUpdateBundle;
}

export interface NswVehiclePosition {
  trip?: NswTripDescriptor;
  vehicle?: NswVehicleDescriptor;
  position?: NswPosition;
  currentStopSequence?: number;
  stopId?: string;
  currentStatus?: string;
  timestamp?: number;
  congestionLevel?: string;
  occupancyStatus?: string;
  /** Extension 1007: per-carriage composition and occupancy */
  consist?: NswCarriageDescriptor[];
}

export interface NswPosition {
  latitude: number;
  longitude: number;
  bearing?: number;
  odometer?: number;
  speed?: number;
  /** Extension 1007: track direction (UP / DOWN) */
  trackDirection?: string;
}

export interface NswVehicleDescriptor {
  id?: string;
  label?: string;
  licensePlate?: string;
  /** Extension 1007: TfNSW vehicle metadata */
  tfnswVehicleDescriptor?: NswTfnswVehicleDescriptor;
}

export interface NswTfnswVehicleDescriptor {
  airConditioned?: boolean;
  wheelchairAccessible?: number;
  vehicleModel?: string;
  performingPriorTrip?: boolean;
  specialVehicleAttributes?: number;
}

export interface NswCarriageDescriptor {
  name?: string;
  positionInConsist: number;
  occupancyStatus?: string;
  quietCarriage?: boolean;
  toilet?: string;
  luggageRack?: boolean;
  departureOccupancyStatus?: string;
}

export interface NswTripDescriptor {
  tripId?: string;
  routeId?: string;
  directionId?: number;
  startTime?: string;
  startDate?: string;
  scheduleRelationship?: string;
}

export interface NswTripUpdate {
  trip: NswTripDescriptor;
  vehicle?: NswVehicleDescriptor;
  stopTimeUpdate: NswStopTimeUpdate[];
  timestamp?: number;
  /** Extension: overall trip delay in seconds */
  delay?: number;
}

export interface NswStopTimeUpdate {
  stopSequence?: number;
  stopId?: string;
  arrival?: NswStopTimeEvent;
  departure?: NswStopTimeEvent;
  scheduleRelationship?: string;
  /** Per-stop departure occupancy */
  departureOccupancyStatus?: string;
  /** Extension 1007: predictive per-carriage occupancy for this stop */
  carriageSeqPredictiveOccupancy?: NswCarriageDescriptor[];
}

export interface NswStopTimeEvent {
  delay?: number;
  time?: number;
  uncertainty?: number;
}

export interface NswAlert {
  activePeriod: Array<{ start?: number; end?: number }>;
  informedEntity: NswEntitySelector[];
  cause?: string;
  effect?: string;
  url?: { translation?: Array<{ text?: string }> };
  headerText?: { translation?: Array<{ text?: string }> };
  descriptionText?: { translation?: Array<{ text?: string }> };
  /** Extension: TTS (text-to-speech) versions of header and description */
  ttsHeaderText?: { translation?: Array<{ text?: string }> };
  ttsDescriptionText?: { translation?: Array<{ text?: string }> };
  /** Extension: severity level (UNKNOWN_SEVERITY / INFO / WARNING / SEVERE) */
  severityLevel?: string;
}

export interface NswEntitySelector {
  agencyId?: string;
  routeId?: string;
  routeType?: number;
  stopId?: string;
  trip?: { tripId?: string; routeId?: string; directionId?: number };
  directionId?: number;
}

export interface NswUpdateBundle {
  gtfsStaticBundle: string;
  updateSequence: number;
  cancelledTrip: string[];
}
