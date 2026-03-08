/**
 * Builds real GTFS-RT protobuf buffers (including TfNSW extension fields)
 * for use in unit and e2e tests. Uses protobufjs directly so the buffers
 * are valid binary proto2 messages that the NSW proto decoder must handle.
 */
import * as protobuf from 'protobufjs';
import * as path from 'path';
import * as fs from 'fs';

let rootCache: protobuf.Root | null = null;

async function getRoot(): Promise<protobuf.Root> {
  if (rootCache) return rootCache;
  // Try source path first (tests run from project root via ts-jest)
  const candidates = [
    path.resolve(process.cwd(), 'src/common/gtfs/gtfs-realtime_1007_extension.proto'),
    path.resolve(process.cwd(), 'dist/common/gtfs/gtfs-realtime_1007_extension.proto'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      rootCache = await protobuf.load(p);
      return rootCache;
    }
  }
  throw new Error(`Cannot find test proto. Tried:\n${candidates.join('\n')}`);
}

export interface VehiclePositionInput {
  id: string;
  latitude: number;
  longitude: number;
  bearing?: number;
  speed?: number;
  odometer?: number;
  trackDirection?: 'UP' | 'DOWN';
  currentStatus?: string;
  congestionLevel?: string;
  occupancyStatus?: string;
  currentStopSequence?: number;
  stopId?: string;
  timestamp?: number;
  tripId?: string;
  routeId?: string;
  directionId?: number;
  vehicleId?: string;
  vehicleLabel?: string;
  vehicleModel?: string;
  airConditioned?: boolean;
  wheelchairAccessible?: number;
  performingPriorTrip?: boolean;
  consist?: Array<{
    name?: string;
    positionInConsist: number;
    occupancyStatus?: string;
    quietCarriage?: boolean;
    toilet?: string;
    luggageRack?: boolean;
    departureOccupancyStatus?: string;
  }>;
}

export interface TripUpdateInput {
  id: string;
  tripId: string;
  routeId?: string;
  vehicleId?: string;
  vehicleLabel?: string;
  delay?: number;
  timestamp?: number;
  stopTimeUpdates?: Array<{
    stopSequence?: number;
    stopId?: string;
    arrivalDelay?: number;
    departureDelay?: number;
    scheduleRelationship?: string;
    departureOccupancyStatus?: string;
    carriagePredictiveOccupancy?: Array<{
      name?: string;
      positionInConsist: number;
      occupancyStatus?: string;
    }>;
  }>;
}

export interface AlertInput {
  id: string;
  headerText?: string;
  descriptionText?: string;
  ttsHeaderText?: string;
  ttsDescriptionText?: string;
  cause?: string;
  effect?: string;
  severityLevel?: string;
  url?: string;
  activePeriods?: Array<{ start?: number; end?: number }>;
  informedEntities?: Array<{
    agencyId?: string;
    routeId?: string;
    routeType?: number;
    stopId?: string;
    directionId?: number;
  }>;
}

function translatedString(root: protobuf.Root, text: string) {
  const TranslatedString = root.lookupType('transit_realtime.TranslatedString');
  return TranslatedString.create({ translation: [{ text }] });
}

/**
 * Looks up the numeric value for a named enum constant.
 * Returns undefined when the name is undefined, or the numeric value as-is.
 * protobufjs requires numeric enum values when encoding messages — string names
 * are silently treated as 0 (the proto3 default) if not converted first.
 */
function enumVal(
  root: protobuf.Root,
  enumName: string,
  name: string | number | undefined,
): number | undefined {
  if (name == null) return undefined;
  if (typeof name === 'number') return name;
  try {
    const e = root.lookupEnum(enumName);
    const v = e.values[name];
    return v; // undefined if name not found
  } catch {
    return undefined;
  }
}

/** Build a FeedMessage buffer containing vehicle positions (with NSW extensions) */
export async function buildVehiclePosFeed(
  vehicles: VehiclePositionInput[],
): Promise<Buffer> {
  const root = await getRoot();
  const FeedMessage = root.lookupType('transit_realtime.FeedMessage');
  const CarriageDescriptor = root.lookupType('transit_realtime.CarriageDescriptor');
  const TfnswVehicleDescriptor = root.lookupType('transit_realtime.TfnswVehicleDescriptor');

  const entities = vehicles.map((v) => {
    // VehicleDescriptor — extension tfnswVehicleDescriptor uses namespaced key
    const vehicleDescriptor: Record<string, unknown> = { id: v.vehicleId ?? v.id };
    if (v.vehicleLabel != null) vehicleDescriptor['label'] = v.vehicleLabel;
    if (
      v.vehicleModel != null ||
      v.airConditioned != null ||
      v.wheelchairAccessible != null ||
      v.performingPriorTrip != null
    ) {
      vehicleDescriptor['.transit_realtime.tfnswVehicleDescriptor'] =
        TfnswVehicleDescriptor.create({
          vehicleModel: v.vehicleModel,
          airConditioned: v.airConditioned,
          wheelchairAccessible: v.wheelchairAccessible,
          performingPriorTrip: v.performingPriorTrip,
        });
    }

    // Position — extension trackDirection uses namespaced key + numeric enum
    const position: Record<string, unknown> = {
      latitude: v.latitude,
      longitude: v.longitude,
    };
    if (v.bearing != null) position['bearing'] = v.bearing;
    if (v.speed != null) position['speed'] = v.speed;
    if (v.odometer != null) position['odometer'] = v.odometer;
    if (v.trackDirection != null) {
      position['.transit_realtime.trackDirection'] = enumVal(
        root,
        'transit_realtime.TrackDirection',
        v.trackDirection,
      );
    }

    // Consist — extension on VehiclePosition uses namespaced key; enum fields use numeric values
    const consist = (v.consist ?? []).map((c) =>
      CarriageDescriptor.create({
        name: c.name,
        positionInConsist: c.positionInConsist,
        occupancyStatus: enumVal(root, 'transit_realtime.OccupancyStatus', c.occupancyStatus),
        quietCarriage: c.quietCarriage,
        toilet: enumVal(root, 'transit_realtime.CarriageDescriptor.ToiletStatus', c.toilet),
        luggageRack: c.luggageRack,
        departureOccupancyStatus: enumVal(
          root,
          'transit_realtime.OccupancyStatus',
          c.departureOccupancyStatus,
        ),
      }),
    );

    return {
      id: v.id,
      vehicle: {
        trip:
          v.tripId != null
            ? { tripId: v.tripId, routeId: v.routeId, directionId: v.directionId }
            : undefined,
        vehicle: vehicleDescriptor,
        position,
        // Standard enum fields also need numeric values
        currentStatus: enumVal(
          root,
          'transit_realtime.VehiclePosition.VehicleStopStatus',
          v.currentStatus,
        ),
        congestionLevel: enumVal(
          root,
          'transit_realtime.VehiclePosition.CongestionLevel',
          v.congestionLevel,
        ),
        occupancyStatus: enumVal(root, 'transit_realtime.OccupancyStatus', v.occupancyStatus),
        currentStopSequence: v.currentStopSequence,
        stopId: v.stopId,
        timestamp: v.timestamp,
        // Extension field — must use namespaced key
        '.transit_realtime.consist': consist.length > 0 ? consist : undefined,
      },
    };
  });

  const msg = FeedMessage.create({
    header: { gtfsRealtimeVersion: '2.0', timestamp: Date.now() },
    entity: entities,
  });
  return Buffer.from(FeedMessage.encode(msg).finish());
}

/** Build a FeedMessage buffer containing trip updates (with NSW extensions) */
export async function buildTripUpdateFeed(
  updates: TripUpdateInput[],
): Promise<Buffer> {
  const root = await getRoot();
  const FeedMessage = root.lookupType('transit_realtime.FeedMessage');
  const CarriageDescriptor = root.lookupType('transit_realtime.CarriageDescriptor');

  const entities = updates.map((u) => ({
    id: u.id,
    tripUpdate: {
      trip: { tripId: u.tripId, routeId: u.routeId },
      vehicle: u.vehicleId != null ? { id: u.vehicleId, label: u.vehicleLabel } : undefined,
      delay: u.delay,
      timestamp: u.timestamp,
      stopTimeUpdate: (u.stopTimeUpdates ?? []).map((stu) => {
        // carriageSeqPredictiveOccupancy is an extension field — namespaced key required
        const carriages = (stu.carriagePredictiveOccupancy ?? []).map((c) =>
          CarriageDescriptor.create({
            positionInConsist: c.positionInConsist,
            occupancyStatus: enumVal(root, 'transit_realtime.OccupancyStatus', c.occupancyStatus),
          }),
        );
        return {
          stopSequence: stu.stopSequence,
          stopId: stu.stopId,
          arrival: stu.arrivalDelay != null ? { delay: stu.arrivalDelay } : undefined,
          departure: stu.departureDelay != null ? { delay: stu.departureDelay } : undefined,
          scheduleRelationship: stu.scheduleRelationship,
          departureOccupancyStatus: enumVal(
            root,
            'transit_realtime.OccupancyStatus',
            stu.departureOccupancyStatus,
          ),
          '.transit_realtime.carriageSeqPredictiveOccupancy':
            carriages.length > 0 ? carriages : undefined,
        };
      }),
    },
  }));

  const msg = FeedMessage.create({
    header: { gtfsRealtimeVersion: '2.0', timestamp: Date.now() },
    entity: entities,
  });
  return Buffer.from(FeedMessage.encode(msg).finish());
}

/** Build a FeedMessage buffer containing alerts (with NSW extensions) */
export async function buildAlertFeed(alerts: AlertInput[]): Promise<Buffer> {
  const root = await getRoot();
  const FeedMessage = root.lookupType('transit_realtime.FeedMessage');

  const entities = alerts.map((a) => ({
    id: a.id,
    alert: {
      // Enum fields must be numeric; toObject({ enums: String }) converts them back to names
      cause: enumVal(root, 'transit_realtime.Alert.Cause', a.cause),
      effect: enumVal(root, 'transit_realtime.Alert.Effect', a.effect),
      severityLevel: enumVal(root, 'transit_realtime.Alert.SeverityLevel', a.severityLevel),
      headerText: a.headerText ? translatedString(root, a.headerText) : undefined,
      descriptionText: a.descriptionText ? translatedString(root, a.descriptionText) : undefined,
      ttsHeaderText: a.ttsHeaderText ? translatedString(root, a.ttsHeaderText) : undefined,
      ttsDescriptionText: a.ttsDescriptionText
        ? translatedString(root, a.ttsDescriptionText)
        : undefined,
      url: a.url ? translatedString(root, a.url) : undefined,
      activePeriod: a.activePeriods ?? [],
      informedEntity: (a.informedEntities ?? []).map((ie) => ({
        agencyId: ie.agencyId,
        routeId: ie.routeId,
        routeType: ie.routeType,
        stopId: ie.stopId,
        directionId: ie.directionId,
      })),
    },
  }));

  const msg = FeedMessage.create({
    header: { gtfsRealtimeVersion: '2.0', timestamp: Date.now() },
    entity: entities,
  });
  return Buffer.from(FeedMessage.encode(msg).finish());
}
