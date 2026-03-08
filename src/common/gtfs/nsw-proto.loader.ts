import * as protobuf from 'protobufjs';
import * as path from 'path';
import * as fs from 'fs';

const PROTO_FILENAME = 'gtfs-realtime_1007_extension.proto';

let rootCache: protobuf.Root | null = null;

/**
 * Resolves the proto file path, trying several locations to handle both
 * development (ts-node) and production (compiled) environments.
 *
 * Because tsconfig.build.json lacks an explicit rootDir, TypeScript infers
 * the project root as rootDir (due to drizzle.config.ts at root level).
 * This means compiled output lands in dist/src/... while nest-cli assets
 * copy to dist/common/... — so we try both plus the raw src/ path.
 */
function resolveProtoPath(): string {
  const candidates = [
    // Compiled output location (dist/src/common/gtfs/ when rootDir = project root)
    path.join(__dirname, PROTO_FILENAME),
    // nest-cli assets copy target (dist/common/gtfs/ relative to project)
    path.join(process.cwd(), 'dist', 'common', 'gtfs', PROTO_FILENAME),
    // Source tree (ts-node / local dev without compilation)
    path.join(process.cwd(), 'src', 'common', 'gtfs', PROTO_FILENAME),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(
    `Cannot locate GTFS-RT proto file. Searched:\n${candidates.join('\n')}`,
  );
}

/**
 * Lazily loads the TfNSW GTFS-RT extension proto (field 1007) and caches
 * the result for the lifetime of the process.
 */
async function getNswProtoRoot(): Promise<protobuf.Root> {
  if (rootCache) return rootCache;
  const protoPath = resolveProtoPath();
  rootCache = await protobuf.load(protoPath);
  return rootCache;
}

/**
 * Decodes a raw GTFS-RT protobuf buffer using the full TfNSW extension schema.
 * Extension fields (1007) — consist, tfnsw_vehicle_descriptor, track_direction,
 * carriage_seq_predictive_occupancy — are decoded alongside standard fields.
 *
 * protobufjs registers proto2 `extend` fields under a namespaced key
 * (e.g. `.transit_realtime.consist`) rather than a plain name. After calling
 * toObject() we normalise these back to plain names so the rest of the
 * application can use the typed interfaces without worrying about prefixes.
 */
export async function decodeFeedMessage(buffer: Buffer): Promise<NswFeedMessage> {
  const root = await getNswProtoRoot();
  const FeedMessageType = root.lookupType('transit_realtime.FeedMessage');
  const decoded = FeedMessageType.decode(new Uint8Array(buffer));
  const raw = FeedMessageType.toObject(decoded, {
    longs: Number,
    enums: String,
    defaults: false,
    arrays: true,
    objects: true,
    oneofs: true,
  }) as Record<string, any>;

  return {
    header: raw['header'] as NswFeedHeader,
    entity: ((raw['entity'] ?? []) as Record<string, any>[]).map(normalizeEntity),
  };
}

// ─── Proto extension key normalization ──────────────────────────────────────
// protobufjs stores proto2 `extend` fields with their fully-qualified name as
// the object key (e.g. ".transit_realtime.consist"). These helpers rename them
// to the simple field names used by our typed interfaces.

const EXT_CONSIST = '.transit_realtime.consist';
const EXT_TFNSW_VD = '.transit_realtime.tfnswVehicleDescriptor';
const EXT_TRACK_DIR = '.transit_realtime.trackDirection';
const EXT_CARRIAGE_OCC = '.transit_realtime.carriageSeqPredictiveOccupancy';

function normalizeEntity(e: Record<string, any>): NswFeedEntity {
  return {
    id: e['id'],
    isDeleted: e['isDeleted'],
    vehicle: e['vehicle'] ? normalizeVehiclePosition(e['vehicle']) : undefined,
    tripUpdate: e['tripUpdate'] ? normalizeTripUpdate(e['tripUpdate']) : undefined,
    alert: e['alert'] as NswAlert | undefined,
    update: e['update'] as NswUpdateBundle | undefined,
  };
}

function normalizeVehiclePosition(v: Record<string, any>): NswVehiclePosition {
  return {
    trip: v['trip'] as NswTripDescriptor | undefined,
    vehicle: v['vehicle'] ? normalizeVehicleDescriptor(v['vehicle']) : undefined,
    position: v['position'] ? normalizePosition(v['position']) : undefined,
    currentStopSequence: v['currentStopSequence'],
    stopId: v['stopId'],
    currentStatus: v['currentStatus'],
    timestamp: v['timestamp'],
    congestionLevel: v['congestionLevel'],
    occupancyStatus: v['occupancyStatus'],
    consist: v[EXT_CONSIST] as NswCarriageDescriptor[] | undefined,
  };
}

function normalizePosition(p: Record<string, any>): NswPosition {
  return {
    latitude: p['latitude'],
    longitude: p['longitude'],
    bearing: p['bearing'],
    odometer: p['odometer'],
    speed: p['speed'],
    trackDirection: p[EXT_TRACK_DIR],
  };
}

function normalizeVehicleDescriptor(vd: Record<string, any>): NswVehicleDescriptor {
  return {
    id: vd['id'],
    label: vd['label'],
    licensePlate: vd['licensePlate'],
    tfnswVehicleDescriptor: vd[EXT_TFNSW_VD] as NswTfnswVehicleDescriptor | undefined,
  };
}

function normalizeTripUpdate(tu: Record<string, any>): NswTripUpdate {
  return {
    trip: tu['trip'] as NswTripDescriptor,
    vehicle: tu['vehicle'] ? normalizeVehicleDescriptor(tu['vehicle']) : undefined,
    stopTimeUpdate: ((tu['stopTimeUpdate'] ?? []) as Record<string, any>[]).map(
      normalizeStopTimeUpdate,
    ),
    timestamp: tu['timestamp'],
    delay: tu['delay'],
  };
}

function normalizeStopTimeUpdate(stu: Record<string, any>): NswStopTimeUpdate {
  return {
    stopSequence: stu['stopSequence'],
    stopId: stu['stopId'],
    arrival: stu['arrival'] as NswStopTimeEvent | undefined,
    departure: stu['departure'] as NswStopTimeEvent | undefined,
    scheduleRelationship: stu['scheduleRelationship'],
    departureOccupancyStatus: stu['departureOccupancyStatus'],
    carriageSeqPredictiveOccupancy: stu[EXT_CARRIAGE_OCC] as
      | NswCarriageDescriptor[]
      | undefined,
  };
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
