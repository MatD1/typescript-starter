import { decodeFeedMessage } from './nsw-proto.loader';
import { buildVehiclePosFeed, buildAlertFeed } from '../../../test/helpers/test-protobuf-builder';

describe('NswProtoLoader', () => {
  describe('decodeFeedMessage', () => {
    it('decodes a minimal valid FeedMessage buffer', async () => {
      const buffer = await buildVehiclePosFeed([]);
      const feed = await decodeFeedMessage(buffer);
      expect(feed).toBeDefined();
      expect(Array.isArray(feed.entity)).toBe(true);
      expect(feed.header.gtfsRealtimeVersion).toBe('2.0');
    });

    it('decodes standard VehiclePosition fields', async () => {
      const buffer = await buildVehiclePosFeed([
        {
          id: 'v1',
          vehicleId: 'T123',
          latitude: -33.865,
          longitude: 151.2099,
          bearing: 90,
          speed: 15,
          tripId: 'trip-001',
          routeId: 'T1',
          timestamp: 1700000000,
        },
      ]);
      const feed = await decodeFeedMessage(buffer);
      const entity = feed.entity[0];
      expect(entity.id).toBe('v1');
      expect(entity.vehicle).toBeDefined();
      const v = entity.vehicle!;
      expect(v.position?.latitude).toBeCloseTo(-33.865, 2);
      expect(v.position?.longitude).toBeCloseTo(151.2099, 2);
      expect(v.position?.bearing).toBeCloseTo(90, 0);
      expect(v.trip?.tripId).toBe('trip-001');
    });

    it('decodes TfNSW extension: VehicleDescriptor.tfnswVehicleDescriptor (field 1007)', async () => {
      const buffer = await buildVehiclePosFeed([
        {
          id: 'v-ext',
          vehicleId: 'S42',
          latitude: -33.9,
          longitude: 151.1,
          vehicleLabel: 'Set 42',
          vehicleModel: 'Waratah A',
          airConditioned: true,
          wheelchairAccessible: 1,
          performingPriorTrip: false,
        },
      ]);
      const feed = await decodeFeedMessage(buffer);
      const v = feed.entity[0].vehicle!;
      const vd = v.vehicle!;
      expect(vd.label).toBe('Set 42');
      // Extension field 1007 on VehicleDescriptor
      expect(vd.tfnswVehicleDescriptor).toBeDefined();
      expect(vd.tfnswVehicleDescriptor!.vehicleModel).toBe('Waratah A');
      expect(vd.tfnswVehicleDescriptor!.airConditioned).toBe(true);
      expect(vd.tfnswVehicleDescriptor!.wheelchairAccessible).toBe(1);
    });

    it('decodes TfNSW extension: VehiclePosition.consist (field 1007)', async () => {
      const buffer = await buildVehiclePosFeed([
        {
          id: 'v-consist',
          vehicleId: 'S99',
          latitude: -33.8,
          longitude: 151.0,
          consist: [
            { positionInConsist: 1, occupancyStatus: 'MANY_SEATS_AVAILABLE', quietCarriage: true, luggageRack: false },
            { positionInConsist: 2, occupancyStatus: 'STANDING_ROOM_ONLY', quietCarriage: false, luggageRack: true },
          ],
        },
      ]);
      const feed = await decodeFeedMessage(buffer);
      const v = feed.entity[0].vehicle!;
      // Extension field 1007 on VehiclePosition
      expect(v.consist).toBeDefined();
      expect(v.consist!.length).toBe(2);
      expect(v.consist![0].positionInConsist).toBe(1);
      expect(v.consist![0].occupancyStatus).toBe('MANY_SEATS_AVAILABLE');
      expect(v.consist![0].quietCarriage).toBe(true);
      expect(v.consist![1].positionInConsist).toBe(2);
      expect(v.consist![1].luggageRack).toBe(true);
    });

    it('decodes TfNSW extension: Position.trackDirection (field 1007)', async () => {
      const buffer = await buildVehiclePosFeed([
        { id: 'v-dir', vehicleId: 'D1', latitude: -34.0, longitude: 150.9, trackDirection: 'DOWN' },
      ]);
      const feed = await decodeFeedMessage(buffer);
      const pos = feed.entity[0].vehicle!.position!;
      // Extension field 1007 on Position
      expect(pos.trackDirection).toBe('DOWN');
    });

    it('decodes TfNSW Alert extensions: severityLevel and TTS fields', async () => {
      const buffer = await buildAlertFeed([
        {
          id: 'alert-1',
          headerText: 'Service disruption',
          descriptionText: 'Trains delayed due to signal fault',
          ttsHeaderText: 'Service disruption on T1 line',
          ttsDescriptionText: 'Trains are currently delayed due to a signal fault',
          cause: 'TECHNICAL_PROBLEM',
          effect: 'SIGNIFICANT_DELAYS',
          severityLevel: 'WARNING',
          activePeriods: [{ start: 1700000000, end: 1700003600 }],
          informedEntities: [{ routeId: 'T1', directionId: 1, routeType: 2 }],
        },
      ]);
      const feed = await decodeFeedMessage(buffer);
      const alert = feed.entity[0].alert!;
      expect(alert.cause).toBe('TECHNICAL_PROBLEM');
      expect(alert.effect).toBe('SIGNIFICANT_DELAYS');
      expect(alert.severityLevel).toBe('WARNING');
      // TTS fields are TranslatedString — check translation array
      expect((alert.ttsHeaderText as any)?.translation?.[0]?.text).toBe(
        'Service disruption on T1 line',
      );
      expect((alert.ttsDescriptionText as any)?.translation?.[0]?.text).toBe(
        'Trains are currently delayed due to a signal fault',
      );
    });
  });
});
