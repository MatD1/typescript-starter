import { Test, TestingModule } from '@nestjs/testing';
import { GtfsRealtimeService } from './gtfs-realtime.service';
import { TransportService } from './transport.service';
import {
  buildVehiclePosFeed,
  buildTripUpdateFeed,
  buildAlertFeed,
} from '../../test/helpers/test-protobuf-builder';

/** Minimal TransportService mock — getGtfsRealtime is overridden per-test */
const mockTransportService = {
  getGtfsRealtime: jest.fn<Promise<Buffer>, [string, string]>(),
};

describe('GtfsRealtimeService', () => {
  let service: GtfsRealtimeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GtfsRealtimeService,
        { provide: TransportService, useValue: mockTransportService },
      ],
    }).compile();

    service = module.get<GtfsRealtimeService>(GtfsRealtimeService);
    jest.clearAllMocks();
  });

  // ─── getVehiclePositions ────────────────────────────────────────────────────

  describe('getVehiclePositions', () => {
    it('maps standard fields correctly', async () => {
      const buf = await buildVehiclePosFeed([
        {
          id: 'e1',
          vehicleId: 'V1',
          latitude: -33.865,
          longitude: 151.21,
          bearing: 270,
          speed: 20,
          tripId: 'TRIP1',
          routeId: 'T1',
          directionId: 0,
          currentStatus: 'IN_TRANSIT_TO',
          occupancyStatus: 'MANY_SEATS_AVAILABLE',
          timestamp: 1700000000,
        },
      ]);
      mockTransportService.getGtfsRealtime.mockResolvedValue(buf);

      const results = await service.getVehiclePositions('sydneytrains');
      expect(results).toHaveLength(1);
      const v = results[0];
      expect(v.vehicleId).toBe('V1');
      expect(v.latitude).toBeCloseTo(-33.865, 2);
      expect(v.longitude).toBeCloseTo(151.21, 2);
      expect(v.bearing).toBeCloseTo(270, 0);
      expect(v.speed).toBeCloseTo(20, 0);
      expect(v.tripId).toBe('TRIP1');
      expect(v.routeId).toBe('T1');
      expect(v.directionId).toBe(0);
      expect(v.currentStatus).toBe('IN_TRANSIT_TO');
      expect(v.occupancyStatus).toBe('MANY_SEATS_AVAILABLE');
      expect(v.timestamp).toBe(1700000000);
    });

    it('maps TfNSW vehicle descriptor extension fields', async () => {
      const buf = await buildVehiclePosFeed([
        {
          id: 'e2',
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
      mockTransportService.getGtfsRealtime.mockResolvedValue(buf);

      const results = await service.getVehiclePositions('sydneytrains');
      const v = results[0];
      expect(v.vehicleLabel).toBe('Set 42');
      expect(v.vehicleModel).toBe('Waratah A');
      expect(v.airConditioned).toBe(true);
      expect(v.wheelchairAccessible).toBe(1);
      expect(v.performingPriorTrip).toBe(false);
    });

    it('maps TfNSW consist extension (VehiclePosition field 1007)', async () => {
      const buf = await buildVehiclePosFeed([
        {
          id: 'e3',
          vehicleId: 'S99',
          latitude: -33.8,
          longitude: 151.0,
          consist: [
            {
              positionInConsist: 1,
              occupancyStatus: 'FEW_SEATS_AVAILABLE',
              quietCarriage: true,
              luggageRack: false,
              departureOccupancyStatus: 'STANDING_ROOM_ONLY',
            },
            {
              positionInConsist: 2,
              occupancyStatus: 'STANDING_ROOM_ONLY',
              quietCarriage: false,
              luggageRack: true,
            },
          ],
        },
      ]);
      mockTransportService.getGtfsRealtime.mockResolvedValue(buf);

      const results = await service.getVehiclePositions('sydneytrains');
      const v = results[0];
      expect(v.consist).toBeDefined();
      expect(v.consist).toHaveLength(2);
      const c1 = v.consist![0];
      expect(c1.positionInConsist).toBe(1);
      expect(c1.occupancyStatus).toBe('FEW_SEATS_AVAILABLE');
      expect(c1.quietCarriage).toBe(true);
      expect(c1.luggageRack).toBe(false);
      expect(c1.departureOccupancyStatus).toBe('STANDING_ROOM_ONLY');
      const c2 = v.consist![1];
      expect(c2.positionInConsist).toBe(2);
      expect(c2.luggageRack).toBe(true);
    });

    it('maps TfNSW Position.trackDirection extension (field 1007)', async () => {
      const buf = await buildVehiclePosFeed([
        { id: 'e4', vehicleId: 'D1', latitude: -34.0, longitude: 150.9, trackDirection: 'UP' },
      ]);
      mockTransportService.getGtfsRealtime.mockResolvedValue(buf);

      const results = await service.getVehiclePositions('sydneytrains');
      expect(results[0].trackDirection).toBe('UP');
    });

    it('maps Position.odometer field', async () => {
      const buf = await buildVehiclePosFeed([
        { id: 'e5', vehicleId: 'O1', latitude: -33.7, longitude: 151.3, odometer: 12345.6 },
      ]);
      mockTransportService.getGtfsRealtime.mockResolvedValue(buf);

      const results = await service.getVehiclePositions('sydneytrains');
      expect(results[0].odometer).toBeCloseTo(12345.6, 1);
    });

    it('returns empty array for feed with no vehicle entities', async () => {
      const buf = await buildVehiclePosFeed([]);
      mockTransportService.getGtfsRealtime.mockResolvedValue(buf);

      const results = await service.getVehiclePositions('buses');
      expect(results).toHaveLength(0);
    });
  });

  // ─── getTripUpdates ─────────────────────────────────────────────────────────

  describe('getTripUpdates', () => {
    it('maps standard trip update fields', async () => {
      const buf = await buildTripUpdateFeed([
        {
          id: 'tu1',
          tripId: 'TRIP-A',
          routeId: 'T2',
          vehicleId: 'V2',
          vehicleLabel: 'Set 10',
          timestamp: 1700001000,
          stopTimeUpdates: [
            { stopSequence: 1, stopId: 'S1', arrivalDelay: 120, departureDelay: 90 },
          ],
        },
      ]);
      mockTransportService.getGtfsRealtime.mockResolvedValue(buf);

      const results = await service.getTripUpdates('sydneytrains');
      expect(results).toHaveLength(1);
      const tu = results[0];
      expect(tu.tripId).toBe('TRIP-A');
      expect(tu.routeId).toBe('T2');
      expect(tu.vehicleId).toBe('V2');
      expect(tu.vehicleLabel).toBe('Set 10');
      expect(tu.timestamp).toBe(1700001000);
      expect(tu.stopTimeUpdates).toHaveLength(1);
      expect(tu.stopTimeUpdates[0].arrivalDelay).toBe(120);
      expect(tu.stopTimeUpdates[0].departureDelay).toBe(90);
    });

    it('maps TripUpdate.delay (overall trip delay) extension field', async () => {
      const buf = await buildTripUpdateFeed([
        { id: 'tu2', tripId: 'TRIP-B', delay: 300 },
      ]);
      mockTransportService.getGtfsRealtime.mockResolvedValue(buf);

      const results = await service.getTripUpdates('sydneytrains');
      expect(results[0].delay).toBe(300);
    });

    it('maps StopTimeUpdate.departureOccupancyStatus field', async () => {
      const buf = await buildTripUpdateFeed([
        {
          id: 'tu3',
          tripId: 'TRIP-C',
          stopTimeUpdates: [
            { stopSequence: 1, stopId: 'S5', departureOccupancyStatus: 'FULL' },
          ],
        },
      ]);
      mockTransportService.getGtfsRealtime.mockResolvedValue(buf);

      const results = await service.getTripUpdates('sydneytrains');
      expect(results[0].stopTimeUpdates[0].departureOccupancyStatus).toBe('FULL');
    });

    it('maps StopTimeUpdate.carriagePredictiveOccupancy extension (field 1007)', async () => {
      const buf = await buildTripUpdateFeed([
        {
          id: 'tu4',
          tripId: 'TRIP-D',
          stopTimeUpdates: [
            {
              stopSequence: 2,
              stopId: 'S10',
              carriagePredictiveOccupancy: [
                { positionInConsist: 1, occupancyStatus: 'EMPTY' },
                { positionInConsist: 2, occupancyStatus: 'MANY_SEATS_AVAILABLE' },
              ],
            },
          ],
        },
      ]);
      mockTransportService.getGtfsRealtime.mockResolvedValue(buf);

      const results = await service.getTripUpdates('sydneytrains');
      const stu = results[0].stopTimeUpdates[0];
      expect(stu.carriagePredictiveOccupancy).toBeDefined();
      expect(stu.carriagePredictiveOccupancy).toHaveLength(2);
      expect(stu.carriagePredictiveOccupancy![0].positionInConsist).toBe(1);
      expect(stu.carriagePredictiveOccupancy![0].occupancyStatus).toBe('EMPTY');
      expect(stu.carriagePredictiveOccupancy![1].occupancyStatus).toBe('MANY_SEATS_AVAILABLE');
    });
  });

  // ─── getAlerts ──────────────────────────────────────────────────────────────

  describe('getAlerts', () => {
    it('maps standard alert fields', async () => {
      const buf = await buildAlertFeed([
        {
          id: 'a1',
          headerText: 'Track work',
          descriptionText: 'Bus replacement in effect',
          url: 'https://transportnsw.info/alert/1',
          cause: 'MAINTENANCE',
          effect: 'NO_SERVICE',
          activePeriods: [{ start: 1700000000, end: 1700007200 }],
          informedEntities: [{ routeId: 'T1' }],
        },
      ]);
      mockTransportService.getGtfsRealtime.mockResolvedValue(buf);

      const results = await service.getAlerts('sydneytrains');
      expect(results).toHaveLength(1);
      const a = results[0];
      expect(a.id).toBe('a1');
      expect(a.headerText).toBe('Track work');
      expect(a.descriptionText).toBe('Bus replacement in effect');
      expect(a.url).toBe('https://transportnsw.info/alert/1');
      expect(a.cause).toBe('MAINTENANCE');
      expect(a.effect).toBe('NO_SERVICE');
      expect(a.activePeriods[0].start).toBe(1700000000);
      expect(a.informedEntities[0].routeId).toBe('T1');
    });

    it('maps TfNSW Alert.severityLevel extension field', async () => {
      const buf = await buildAlertFeed([
        { id: 'a2', headerText: 'Minor delay', severityLevel: 'INFO' },
      ]);
      mockTransportService.getGtfsRealtime.mockResolvedValue(buf);

      const results = await service.getAlerts('sydneytrains');
      expect(results[0].severityLevel).toBe('INFO');
    });

    it('maps TfNSW Alert TTS extension fields (ttsHeaderText + ttsDescriptionText)', async () => {
      const buf = await buildAlertFeed([
        {
          id: 'a3',
          headerText: 'Delays',
          ttsHeaderText: 'There are delays on the T1 line',
          ttsDescriptionText: 'Trains are running approximately 10 minutes late',
          severityLevel: 'WARNING',
        },
      ]);
      mockTransportService.getGtfsRealtime.mockResolvedValue(buf);

      const results = await service.getAlerts('sydneytrains');
      const a = results[0];
      expect(a.ttsHeaderText).toBe('There are delays on the T1 line');
      expect(a.ttsDescriptionText).toBe(
        'Trains are running approximately 10 minutes late',
      );
      expect(a.severityLevel).toBe('WARNING');
    });

    it('maps TfNSW Alert.cause NSW-specific values (STRIKE, DEMONSTRATION)', async () => {
      const buf = await buildAlertFeed([
        { id: 'a4', headerText: 'Strike action', cause: 'STRIKE', effect: 'NO_SERVICE' },
      ]);
      mockTransportService.getGtfsRealtime.mockResolvedValue(buf);

      const results = await service.getAlerts('sydneytrains');
      expect(results[0].cause).toBe('STRIKE');
    });

    it('maps InformedEntity.directionId and routeType NSW fields', async () => {
      const buf = await buildAlertFeed([
        {
          id: 'a5',
          headerText: 'Alert',
          informedEntities: [{ routeId: 'T1', directionId: 1, routeType: 2 }],
        },
      ]);
      mockTransportService.getGtfsRealtime.mockResolvedValue(buf);

      const results = await service.getAlerts('sydneytrains');
      const ie = results[0].informedEntities[0];
      expect(ie.routeId).toBe('T1');
      expect(ie.directionId).toBe(1);
      expect(ie.routeType).toBe(2);
    });
  });
});
