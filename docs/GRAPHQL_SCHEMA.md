# NSW Transport API — GraphQL Schema Reference

Endpoint: `POST /graphql`  
Auth: send `X-API-Key` in the HTTP header (same as REST).  
All queries are nullable-safe; missing mode data is silently omitted (failed upstream fetches are logged, not thrown).

---

## Authentication header

```
X-API-Key: nsw_xxx
```

Or as a Bearer token:
```
Authorization: Bearer nsw_xxx
```

---

## TransportMode Enum

```graphql
enum TransportMode {
  sydneytrains  # Sydney Trains suburban network
  intercity     # Intercity / regional rail services
  buses         # Sydney metropolitan buses
  nswtrains     # NSW TrainLink long-distance trains
  ferries       # Sydney Ferries
  metro         # Sydney Metro rapid transit
  lightrail     # Light rail (CBD, Inner West, Parramatta)
}
```

---

## Queries

### vehiclePositions

Live GPS positions of all active vehicles.  
**Complexity**: 7 (all modes) or 1 (single mode). Cached 15 s per mode.

```graphql
vehiclePositions(mode: TransportMode): [VehiclePositionObject!]!
```

| Argument | Type           | Required | Description               |
|----------|----------------|----------|---------------------------|
| `mode`   | `TransportMode`| No       | Omit to fetch all 7 modes |

**Example — all Sydney Trains vehicles:**
```graphql
query LiveTrains {
  vehiclePositions(mode: sydneytrains) {
    vehicleId
    routeId
    tripId
    latitude
    longitude
    bearing
    speed
    currentStatus
    occupancyStatus
    trackDirection
    vehicleLabel
    consist {
      carriageDescriptorId
      occupancyStatus
      wheelchairAccessible
    }
    mode
  }
}
```

---

### tripUpdates

Real-time trip delay and cancellation data.  
**Complexity**: 7 (all modes) or 1 (single mode). Cached 30 s per mode.

```graphql
tripUpdates(mode: TransportMode): [TripUpdateObject!]!
```

**Example — metro delays only:**
```graphql
query MetroDelays {
  tripUpdates(mode: metro) {
    tripId
    routeId
    delay
    scheduleRelationship
    stopTimeUpdates {
      stopId
      stopSequence
      arrivalDelay
      departureDelay
      carriagePredictiveOccupancy {
        occupancyStatus
      }
    }
    mode
  }
}
```

---

### trackTrip ⭐ Flutter map feature

Look up the live vehicle for a specific planned trip. Returns the combined GPS
position, delays, stop-time updates and vehicle amenities in a single query — no
client-side joins needed.

Returns **`null`** (not an error) when the vehicle has not started broadcasting
yet (pre-departure) or when the trip has ended.

**Complexity**: 1 per call (mode-scoped cache hit) to 7 (full fan-out).  
**Cache**: 15 s under `realtime:track:{tripId}`.

```graphql
trackTrip(tripId: String!, mode: TransportMode): TrackedTripObject
```

| Argument | Type            | Required | Description                                         |
|----------|-----------------|----------|-----------------------------------------------------|
| `tripId` | `String!`       | Yes      | GTFS trip ID from `planTrip` → `legs[n].tripId`    |
| `mode`   | `TransportMode` | No       | Mode hint for faster lookup (e.g. `sydneytrains`)   |

**Full Flutter query — map pin + train card:**
```graphql
query TrackMyTrip($tripId: String!, $mode: TransportMode) {
  trackTrip(tripId: $tripId, mode: $mode) {
    tripId
    routeId
    vehicleLabel
    mode
    scheduleRelationship
    delay
    position {
      latitude
      longitude
      bearing
      speed
      currentStatus
      currentStopId
      occupancyStatus
      trackDirection
      consist {
        positionInConsist
        occupancyStatus
        quietCarriage
      }
    }
    stopTimeUpdates {
      stopId
      stopSequence
      arrivalDelay
      departureDelay
      departureOccupancyStatus
    }
    vehicleModel
    airConditioned
    wheelchairAccessible
  }
}
```

**Flutter polling pattern** (update map pin every 15 s):
```dart
// Poll trackTrip every 15 s to keep the map pin fresh
Timer.periodic(const Duration(seconds: 15), (_) async {
  final result = await client.query(
    QueryOptions(
      document: gql(trackMyTripQuery),
      variables: {'tripId': leg.tripId, 'mode': leg.mode},
      fetchPolicy: FetchPolicy.networkOnly,
    ),
  );
  if (result.data?['trackTrip'] != null) {
    final tracked = TrackedTrip.fromJson(result.data!['trackTrip']);
    mapController.animateCamera(CameraUpdate.newLatLng(
      LatLng(tracked.position.latitude, tracked.position.longitude),
    ));
  }
});
```

**Null handling** — vehicle not yet active:
```dart
final tracked = result.data?['trackTrip'];
if (tracked == null) {
  // Show "Train not yet active" banner; retry in 30 s
  return;
}
```

---

### disruptions

Current service alerts. Cached 300 s per mode.

```graphql
disruptions(mode: TransportMode, effect: String): [DisruptionObject!]!
```

| Argument | Type           | Required | Description                        |
|----------|----------------|----------|------------------------------------|
| `mode`   | `TransportMode`| No       | Omit for all modes                 |
| `effect` | `String`       | No       | Filter: `NO_SERVICE`, `DELAYS`, `REDUCED_SERVICE`, `DETOUR`, `MODIFIED_SERVICE`, `OTHER_EFFECT` |

**Example — all current disruptions:**
```graphql
query AllDisruptions {
  disruptions {
    id
    headerText
    descriptionText
    severityLevel
    cause
    effect
    activePeriods { start end }
    informedEntities { routeId stopId routeType }
    mode
  }
}
```

---

### planTrip

Journey planner — finds one or more itineraries between two points (v1 API).  
Uses `depArrMacro: dep` (trips departing after specified time). Cached 300 s per unique parameter set.

```graphql
planTrip(
  originId: String
  originName: String
  originCoord: String
  destId: String
  destName: String
  destCoord: String
  itdDate: String
  itdTime: String
  calcNumberOfTrips: Int
  wheelchair: Boolean
): [TripResultObject!]!
```

| Argument            | Type     | Description                                      |
|---------------------|----------|--------------------------------------------------|
| `originId`          | `String` | GTFS stop ID of origin                           |
| `originName`        | `String` | Free-text name search                            |
| `originCoord`       | `String` | `lon:lat:EPSG:4326` (longitude first)            |
| `destId`            | `String` | GTFS stop ID of destination                      |
| `destName`          | `String` | Free-text name search                            |
| `destCoord`         | `String` | `lon:lat:EPSG:4326` (longitude first)            |
| `itdDate`           | `String` | `YYYYMMDD` (default: now)                       |
| `itdTime`           | `String` | `HHmm` (default: now)                           |
| `calcNumberOfTrips`| `Int`    | Alternatives to return (1–6)                     |
| `wheelchair`        | `Boolean`| If true, only wheelchair-accessible options      |

**Example — trip from Parramatta to Central:**
```graphql
query PlanMyTrip {
  planTrip(originId: "10101100", destName: "Central Station", calcNumberOfTrips: 3) {
    duration
    interchanges
    legs {
      transportation
      lineName
      destination
      origin { name lat lon }
      dest { name lat lon }
      departureTimePlanned
      departureTimeEstimated
      arrivalTimePlanned
      duration
    }
  }
}
```

---

### findStops

Stop/station search by name against the live NSW trip planner (v1 API).  
Cached 3600 s.

```graphql
findStops(query: String!, type: StopFinderType): [StopObject!]!
```

| Argument | Type            | Required | Description                                                       |
|----------|-----------------|----------|-------------------------------------------------------------------|
| `query`  | `String`        | ✓        | Format depends on `type` (see below)                              |
| `type`   | `StopFinderType`| No       | `any` (default) · `stop` · `poi` · `coord`                        |

**Important:** `type` defines the expected `query` format. Use `any` for free-text name search.

| type   | query format              | Example                          |
|--------|---------------------------|----------------------------------|
| `any`  | Any text (name, partial)   | `"Wynyard"`, `"Circular Quay"`   |
| `stop` | Stop ID only (numeric)     | `"200060"`                       |
| `coord`| `lon:lat:EPSG:4326`       | `"151.206:-33.884:EPSG:4326"`    |
| `poi`  | Restrictive; prefer `any`  | —                                |

**Example (name search):**
```graphql
query FindStops {
  findStops(query: "Wynyard") {
    id
    name
    lat
    lon
    transportMode
  }
}
```

---

### departures

Real-time departure board for a stop. Cached 30 s.

```graphql
departures(stopId: String, stopName: String, itdDate: String, itdTime: String): [DepartureObject!]!
```

**Example:**
```graphql
query DepartureBoard {
  departures(stopId: "200060") {
    lineName
    destination
    departureTimePlanned
    departureTimeEstimated
    platform
    transportMode
  }
}
```

---

### nearbyStops

Find stops within a radius using the NSW trip planner coord search (v1 API, `type_1: BUS_POINT`).  
`radius` in metres, default 500. Cached 3600 s.

```graphql
nearbyStops(lat: Float!, lon: Float!, radius: Float): [StopObject!]!
```

**Example:**
```graphql
query NearMe {
  nearbyStops(lat: -33.865, lon: 151.209, radius: 300) {
    id
    name
    lat
    lon
  }
}
```

---

### searchStations

Search the local GTFS static station database. Faster than `findStops` for
known station names. Cached 3600 s.

```graphql
searchStations(query: String!, limit: Int): [StationObject!]!
```

**Example:**
```graphql
query StationSearch {
  searchStations(query: "Central", limit: 5) {
    stopId
    stopName
    lat
    lon
    wheelchairBoarding
    mode
  }
}
```

---

### stationById

Look up a station by GTFS stop ID. Cached 3600 s.

```graphql
stationById(stopId: String!): StationObject
```

**Example:**
```graphql
query GetStation {
  stationById(stopId: "2000001") {
    stopId
    stopName
    lat
    lon
    platformCode
    parentStation
  }
}
```

---

### nearbyStations

Find stations near a coordinate using the local DB (faster than `nearbyStops`).  
Cached 3600 s.

```graphql
nearbyStations(lat: Float!, lon: Float!, radius: Int, limit: Int): [StationObject!]!
```

---

### gtfsRoutes

List GTFS static routes. Cached 86400 s.

```graphql
gtfsRoutes(mode: TransportMode, limit: Int): [GtfsRouteObject!]!
```

---

### gtfsStops

List GTFS static stops. Cached 86400 s.

```graphql
gtfsStops(mode: TransportMode, limit: Int): [GtfsStopObject!]!
```

---

### gtfsTrips

List GTFS static trips, optionally filtered by route. Cached 86400 s.

```graphql
gtfsTrips(routeId: String, limit: Int): [GtfsTripObject!]!
```

---

## Types

### VehiclePositionObject

```graphql
type VehiclePositionObject {
  vehicleId: String!
  tripId: String
  routeId: String
  directionId: Int
  startDate: String
  startTime: String
  tripScheduleRelationship: String
  latitude: Float!
  longitude: Float!
  bearing: Float
  odometer: Float
  speed: Float
  currentStopSequence: Int
  currentStopId: String
  currentStatus: String          # INCOMING_AT | STOPPED_AT | IN_TRANSIT_TO
  timestamp: Int
  congestionLevel: String
  occupancyStatus: String        # EMPTY | MANY_SEATS_AVAILABLE | FEW_SEATS_AVAILABLE | STANDING_ROOM_ONLY | CRUSHED_STANDING_ROOM_ONLY | FULL | NOT_ACCEPTING_PASSENGERS
  trackDirection: String         # UP | DOWN (TfNSW extension)
  vehicleLabel: String           # Set number / fleet label (TfNSW extension)
  vehicleModel: String
  airConditioned: Boolean
  wheelchairAccessible: Int      # 0=unknown 1=accessible 2=not accessible
  performingPriorTrip: Boolean
  specialVehicleAttributes: Int
  consist: [CarriageDescriptorObject!] # Per-carriage data (TfNSW extension)
  mode: String!
}
```

---

### CarriageDescriptorObject

```graphql
type CarriageDescriptorObject {
  carriageDescriptorId: Int
  occupancyStatus: String
  wheelchairAccessible: Int
  toiletFacility: Int
}
```

---

### TfNSWVehicleDescriptorObject

```graphql
type TfNSWVehicleDescriptorObject {
  vehicleModel: String
  airConditioned: Boolean
  wheelchairAccessible: Int
  specialVehicleAttributes: Int
  performingPriorTrip: Boolean
}
```

---

### TripUpdateObject

```graphql
type TripUpdateObject {
  tripId: String!
  routeId: String
  vehicleId: String
  vehicleLabel: String
  directionId: Int
  startDate: String
  startTime: String
  scheduleRelationship: String   # SCHEDULED | ADDED | UNSCHEDULED | CANCELED
  delay: Int                     # Overall trip delay in seconds (positive=late)
  stopTimeUpdates: [StopTimeUpdateObject!]!
  timestamp: Int
  mode: String!
}
```

---

### StopTimeUpdateObject

```graphql
type StopTimeUpdateObject {
  stopSequence: Int
  stopId: String
  arrivalDelay: Int              # Seconds (positive=late, negative=early)
  arrivalTime: Int               # Absolute UNIX timestamp
  departureDelay: Int
  departureTime: Int
  scheduleRelationship: String   # SCHEDULED | SKIPPED | NO_DATA
  departureOccupancyStatus: String
  carriagePredictiveOccupancy: [CarriageDescriptorObject!] # TfNSW extension 1007
}
```

---

### DisruptionObject

```graphql
type DisruptionObject {
  id: String!
  headerText: String
  descriptionText: String
  ttsHeaderText: String          # Text-to-speech version (TfNSW extension)
  ttsDescriptionText: String
  url: String
  cause: String                  # UNKNOWN_CAUSE | OTHER_CAUSE | TECHNICAL_PROBLEM | STRIKE | DEMONSTRATION | ACCIDENT | HOLIDAY | WEATHER | MAINTENANCE | CONSTRUCTION | POLICE_ACTIVITY | MEDICAL_EMERGENCY
  effect: String                 # NO_SERVICE | REDUCED_SERVICE | SIGNIFICANT_DELAYS | DETOUR | ADDITIONAL_SERVICE | MODIFIED_SERVICE | OTHER_EFFECT | UNKNOWN_EFFECT | STOP_MOVED | NO_EFFECT | ACCESSIBILITY_ISSUE
  severityLevel: String          # UNKNOWN_SEVERITY | INFO | WARNING | SEVERE (TfNSW extension)
  activePeriods: [ActivePeriodObject!]!
  informedEntities: [InformedEntityObject!]!
  mode: String!
}
```

---

### ActivePeriodObject

```graphql
type ActivePeriodObject {
  start: Int   # UNIX timestamp (null = indefinite start)
  end: Int     # UNIX timestamp (null = no end)
}
```

---

### InformedEntityObject

```graphql
type InformedEntityObject {
  agencyId: String
  routeId: String
  routeType: Int    # 0=tram 1=metro 2=rail 3=bus 4=ferry 11=trolleybus 12=monorail
  stopId: String
  tripId: String
  directionId: Int
}
```

---

### TripResultObject

```graphql
type TripResultObject {
  legs: [LegObject!]!
  duration: Int      # Total journey time in seconds
  interchanges: Int  # Number of transfers
}
```

---

### LegObject

```graphql
type LegObject {
  transportation: String         # Product name e.g. "Sydney Trains Network"
  lineName: String               # Line/route number e.g. "T1"
  destination: String            # Headsign destination
  origin: LocationObject
  dest: LocationObject
  departureTimePlanned: String   # ISO 8601
  departureTimeEstimated: String # ISO 8601 (real-time adjusted)
  arrivalTimePlanned: String
  arrivalTimeEstimated: String
  duration: Int                  # Leg duration in seconds
}
```

---

### LocationObject

```graphql
type LocationObject {
  id: String
  name: String
  lat: Float
  lon: Float
  type: String   # stop | poi | address | coord
}
```

---

### StopObject

```graphql
type StopObject {
  id: String
  name: String
  disassembledName: String
  lat: Float
  lon: Float
  type: String
  transportMode: String   # Comma-separated GTFS route_type codes
}
```

---

### DepartureObject

```graphql
type DepartureObject {
  stopName: String
  stopId: String
  lineName: String
  destination: String
  departureTimePlanned: String
  departureTimeEstimated: String
  transportMode: String
  platform: String
}
```

---

### StationObject

```graphql
type StationObject {
  stopId: String!
  stopName: String!
  stopCode: String
  lat: Float
  lon: Float
  locationType: Int      # 0=stop/platform 1=station 2=entrance 3=generic node 4=boarding area
  parentStation: String  # Parent station stopId
  wheelchairBoarding: Int # 0=unknown 1=accessible 2=not accessible
  platformCode: String
  mode: String
}
```

---

### GtfsRouteObject

```graphql
type GtfsRouteObject {
  routeId: String!
  routeShortName: String
  routeLongName: String
  routeType: Int    # 0=tram 1=metro 2=rail 3=bus 4=ferry
  routeColor: String  # Hex without #
  mode: String
}
```

---

### GtfsStopObject

```graphql
type GtfsStopObject {
  stopId: String!
  stopName: String!
  stopCode: String
  lat: Float
  lon: Float
  mode: String
}
```

---

### GtfsTripObject

```graphql
type GtfsTripObject {
  tripId: String!
  routeId: String
  serviceId: String
  tripHeadsign: String
  directionId: Int    # 0=outbound 1=inbound
  mode: String
}
```

---

## Flutter Integration

### Setup (`graphql_flutter`)

```dart
// pubspec.yaml
// graphql_flutter: ^5.x.x
// flutter_secure_storage: ^9.x.x

import 'package:graphql_flutter/graphql_flutter.dart';

final HttpLink httpLink = HttpLink(
  'https://your-api.example.com/graphql',
  defaultHeaders: {
    'X-API-Key': await secureStorage.read(key: 'nsw_api_key') ?? '',
  },
);

// Enable Automatic Persisted Queries to minimise payload on cellular
final link = Link.from([
  AuthLink(getToken: () async =>
    await secureStorage.read(key: 'nsw_api_key')),
  httpLink,
]);

ValueNotifier<GraphQLClient> client = ValueNotifier(
  GraphQLClient(
    link: link,
    cache: GraphQLCache(store: InMemoryStore()),
  ),
);
```

### Live vehicle positions

```dart
const String vehiclePositionsQuery = r'''
  query VehiclePositions($mode: TransportMode) {
    vehiclePositions(mode: $mode) {
      vehicleId
      latitude
      longitude
      bearing
      speed
      currentStatus
      occupancyStatus
      routeId
      trackDirection
      consist {
        occupancyStatus
        wheelchairAccessible
      }
      mode
    }
  }
''';

Query(
  options: QueryOptions(
    document: gql(vehiclePositionsQuery),
    variables: {'mode': 'sydneytrains'},
    pollInterval: const Duration(seconds: 15),
  ),
  builder: (result, {fetchMore, refetch}) {
    if (result.hasException) return Text(result.exception.toString());
    if (result.isLoading) return const CircularProgressIndicator();
    final vehicles = result.data?['vehiclePositions'] as List? ?? [];
    return ListView.builder(
      itemCount: vehicles.length,
      itemBuilder: (_, i) => Text('${vehicles[i]['vehicleId']} @ ${vehicles[i]['latitude']},${vehicles[i]['longitude']}'),
    );
  },
)
```

### Trip planner

```dart
const String planTripQuery = r'''
  query PlanTrip($originId: String, $destName: String, $trips: Int) {
    planTrip(originId: $originId, destName: $destName, calcNumberOfTrips: $trips) {
      duration
      interchanges
      legs {
        lineName
        destination
        departureTimePlanned
        departureTimeEstimated
        origin { name }
        dest { name }
      }
    }
  }
''';

final result = await client.value.query(QueryOptions(
  document: gql(planTripQuery),
  variables: {
    'originId': '10101100',
    'destName': 'Central Station',
    'trips': 3,
  },
));
```

### Departure board with polling

```dart
Subscription(
  options: SubscriptionOptions(
    // Use a 30-second poll (no WebSocket subscription needed — 
    // REST Cache-Control handles CDN freshness)
    document: gql(r'''
      query Departures($stopId: String) {
        departures(stopId: $stopId) {
          lineName destination platform
          departureTimePlanned departureTimeEstimated
        }
      }
    '''),
    variables: {'stopId': stopId},
  ),
  builder: (result) { /* render departure list */ },
)
```

---

## Query Limits

| Constraint        | Value | Error code          |
|-------------------|-------|---------------------|
| Max depth         | 8     | `QUERY_TOO_DEEP`    |
| Max complexity    | 1000  | `QUERY_TOO_COMPLEX` |
| Requests per min  | 120   | HTTP `429`          |

Typical query complexities:
- `vehiclePositions(mode: sydneytrains)` → complexity **1**
- `vehiclePositions` (all modes, fan-out) → complexity **7**
- `planTrip { legs { origin { ... } } }` → complexity **~8**
