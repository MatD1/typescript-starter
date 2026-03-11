# NSW Transport API — REST API Reference

Transport endpoints require either **`Authorization: Bearer <session-token>`** or **`X-API-Key: nsw_xxx`**.  
Auth endpoints are public (no key required).  
Base path: `http://localhost:3000`

---

## Authentication

### Sign up (email / password)

```http
POST /auth/sign-up/email
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "s3cr3t",
  "name": "Alice"
}
```

**Response** `200`
```json
{ "user": { "id": "...", "email": "user@example.com", "name": "Alice" } }
```

---

### Sign in (email / password)

```http
POST /auth/sign-in/email
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "s3cr3t"
}
```

**Response** `200`
```json
{
  "user": { "id": "...", "email": "user@example.com" },
  "session": { "token": "<session-token>" }
}
```

---

### Exchange Supabase JWT for session token

Use this from a Flutter app that already has a Supabase session.

```http
POST /auth/supabase/exchange
Content-Type: application/json

{ "token": "<supabase-jwt>" }
```

**Response** `200`
```json
{
  "sessionToken": "<session-token>",
  "refreshToken": "<refresh-token>",
  "expiresAt": "2025-03-11T14:00:00.000Z",
  "userId": "..."
}
```

Session tokens expire in 1 hour. Store the refresh token securely and use it to obtain new tokens before expiry.

---

### Refresh session tokens

Exchange a valid refresh token for new session and refresh tokens. Uses token rotation: the old refresh token is invalidated.

```http
POST /auth/refresh
Authorization: Bearer <refresh-token>
```

Or with body:

```http
POST /auth/refresh
Content-Type: application/json

{ "refreshToken": "<refresh-token>" }
```

**Response** `200`
```json
{
  "sessionToken": "<new-session-token>",
  "refreshToken": "<new-refresh-token>",
  "expiresAt": "2025-03-11T15:00:00.000Z"
}
```

---

### Create API key

Requires a session token (from sign-in or Supabase exchange) in the
`Authorization: Bearer` header.

```http
POST /api/v1/api-keys
Authorization: Bearer <session-token>
Content-Type: application/json

{
  "name": "my-flutter-app",
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```

**Response** `201`
```json
{ "key": "nsw_abc123...", "id": "...", "start": "nsw_abc123" }
```

> **Important**: the full `key` value is only returned once. Store it securely.

---

### List API keys

```http
GET /api/v1/api-keys
Authorization: Bearer <session-token>
```

**Response** `200`
```json
[
  {
    "id": "...",
    "name": "my-flutter-app",
    "start": "nsw_abc123",
    "userId": "...",
    "enabled": true,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "expiresAt": null
  }
]
```

---

### Revoke API key

```http
DELETE /api/v1/api-keys/:id
Authorization: Bearer <session-token>
```

**Response** `200`
```json
{ "success": true }
```

---

## Realtime

### GET /api/v1/realtime/vehicles

Live vehicle positions from GTFS-RT feed.

| Param  | Type           | Required | Description                           |
|--------|----------------|----------|---------------------------------------|
| `mode` | `TransportMode`| No       | Filter to one mode (all if omitted)   |

**`TransportMode` values**: `sydneytrains` · `intercity` · `buses` · `nswtrains` · `ferries` · `metro` · `lightrail`

> **Note:** `intercity` data is derived from the Sydney Trains feed by filtering on intercity route IDs (BMT, CCN, HUN, SCO, SHL). NSW no longer exposes a separate intercity realtime endpoint.

```http
GET /api/v1/realtime/vehicles?mode=sydneytrains
Authorization: Bearer <session-token>
```
Or: `X-API-Key: nsw_xxx`

**Response** `200` — array of `VehiclePosition`
```json
[
  {
    "vehicleId": "A001",
    "tripId": "1234",
    "routeId": "T1",
    "directionId": 0,
    "latitude": -33.865,
    "longitude": 151.209,
    "bearing": 270.0,
    "speed": 15.5,
    "currentStopId": "2000001",
    "currentStatus": "IN_TRANSIT_TO",
    "occupancyStatus": "MANY_SEATS_AVAILABLE",
    "trackDirection": "UP",
    "vehicleLabel": "A001",
    "consist": [
      {
        "carriageDescriptorId": 1,
        "occupancyStatus": "MANY_SEATS_AVAILABLE",
        "wheelchairAccessible": 1
      }
    ],
    "mode": "sydneytrains"
  }
]
```

**Cache-Control**: `public, max-age=15`

---

### GET /api/v1/realtime/trip-updates

Live trip updates (delays, cancellations, added trips).

| Param  | Type           | Required | Description |
|--------|----------------|----------|-------------|
| `mode` | `TransportMode`| No       | Filter mode |

> **Note:** `mode=intercity` returns trip updates filtered from Sydney Trains by intercity route (BMT, CCN, HUN, SCO, SHL).

```http
GET /api/v1/realtime/trip-updates?mode=metro
X-API-Key: nsw_xxx
```

**Response** `200` — array of `TripUpdate`
```json
[
  {
    "tripId": "5678",
    "routeId": "M1",
    "vehicleId": "M003",
    "directionId": 1,
    "scheduleRelationship": "SCHEDULED",
    "delay": 120,
    "stopTimeUpdates": [
      {
        "stopSequence": 3,
        "stopId": "2000100",
        "arrivalDelay": 120,
        "departureDelay": 120,
        "scheduleRelationship": "SCHEDULED"
      }
    ],
    "mode": "metro"
  }
]
```

**Cache-Control**: `public, max-age=30`

---

### GET /api/v1/realtime/track-trip

Track a specific trip live — vehicle GPS position, delays, stop-time updates,
and vehicle amenity info. Use the `tripId` from a planned journey leg.

Returns **404** if the vehicle is not yet active (e.g. pre-departure).

| Param    | Type           | Required | Description                                            |
|----------|----------------|----------|--------------------------------------------------------|
| `tripId` | `string`       | **Yes**  | GTFS trip ID — from a `LegObject.tripId` in a plan    |
| `mode`   | `TransportMode`| No       | Mode hint — optional but improves response time        |

```http
GET /api/v1/realtime/track-trip?tripId=28.T.1-T1-Y-mjp-1.1.H&mode=sydneytrains
X-API-Key: nsw_xxx
```

**Response** `200` — `TrackedTripObject`
```json
{
  "tripId": "28.T.1-T1-Y-mjp-1.1.H",
  "routeId": "T1",
  "vehicleId": "1234",
  "vehicleLabel": "Set 42",
  "mode": "sydneytrains",
  "scheduleRelationship": "SCHEDULED",
  "delay": 120,
  "position": {
    "latitude": -33.865143,
    "longitude": 151.20699,
    "bearing": 270.0,
    "speed": 22.0,
    "currentStatus": "IN_TRANSIT_TO",
    "currentStopId": "2000116",
    "occupancyStatus": "MANY_SEATS_AVAILABLE",
    "trackDirection": "DOWN",
    "timestamp": 1700000000,
    "consist": [
      { "positionInConsist": 1, "occupancyStatus": "MANY_SEATS_AVAILABLE", "quietCarriage": false },
      { "positionInConsist": 2, "occupancyStatus": "FEW_SEATS_AVAILABLE",  "quietCarriage": true  }
    ]
  },
  "stopTimeUpdates": [
    {
      "stopSequence": 5,
      "stopId": "2000116",
      "arrivalDelay": 120,
      "departureDelay": 90,
      "scheduleRelationship": "SCHEDULED",
      "departureOccupancyStatus": "MANY_SEATS_AVAILABLE"
    }
  ],
  "vehicleModel": "Waratah A",
  "airConditioned": true,
  "wheelchairAccessible": 1
}
```

**Response** `404` — when vehicle is not yet active
```json
{ "statusCode": 404, "message": "Trip ... is not currently active. The vehicle may not have departed yet." }
```

**Cache-Control**: `public, max-age=15`

---

## Disruptions

### GET /api/v1/disruptions

Current service alerts from all modes or a specific mode.

| Param    | Type           | Required | Description                                 |
|----------|----------------|----------|---------------------------------------------|
| `mode`   | `TransportMode`| No       | Filter mode                                 |
| `effect` | string         | No       | Filter by effect (`NO_SERVICE`, `DELAYS`, …)|

> **Note:** `mode=intercity` returns alerts filtered from Sydney Trains by intercity route (BMT, CCN, HUN, SCO, SHL).

```http
GET /api/v1/disruptions?mode=buses&effect=DELAYS
X-API-Key: nsw_xxx
```

**Response** `200`
```json
[
  {
    "id": "alert-001",
    "headerText": "Delays on Route 333",
    "descriptionText": "Buses are running up to 15 minutes late.",
    "ttsHeaderText": "Delays on Route three thirty three",
    "cause": "CONSTRUCTION",
    "effect": "DELAYS",
    "severityLevel": "WARNING",
    "activePeriods": [{ "start": 1741300000, "end": 1741400000 }],
    "informedEntities": [{ "routeId": "333", "routeType": 3 }],
    "mode": "buses"
  }
]
```

**Cache-Control**: `public, max-age=300`

---

## Trip Planner

### GET /api/v1/trip-planner/trip

Plan a journey between two locations (v1 API).

| Param               | Type    | Required | Description                         |
|---------------------|---------|----------|-------------------------------------|
| `originId`          | string  | No*      | Stop/place ID of origin             |
| `originName`        | string  | No*      | Name search for origin              |
| `originCoord`       | string  | No*      | `lon:lat:EPSG:4326` (longitude first) |
| `destId`            | string  | No*      | Stop/place ID of destination       |
| `destName`          | string  | No*      | Name search for destination         |
| `destCoord`         | string  | No*      | `lon:lat:EPSG:4326` (longitude first) |
| `itdDate`           | string  | No       | Date `YYYYMMDD`                     |
| `itdTime`           | string  | No       | Time `HHmm`                         |
| `calcNumberOfTrips` | number  | No       | Number of alternatives (1–6)       |
| `wheelchair`        | boolean | No       | If true, only wheelchair-accessible options |

\* At least one of `originId`, `originName`, or `originCoord` is required for origin, and similarly for destination.

```http
GET /api/v1/trip-planner/trip?originId=10101100&destName=Central+Station
X-API-Key: nsw_xxx
```

**Response** `200`
```json
[
  {
    "legs": [
      {
        "transportation": "Sydney Trains Network",
        "lineName": "T1",
        "destination": "Central",
        "origin": { "id": "10101100", "name": "Parramatta", "lat": -33.817, "lon": 151.003, "type": "stop" },
        "dest": { "id": "10101100", "name": "Central", "lat": -33.879, "lon": 151.207, "type": "stop" },
        "departureTimePlanned": "2026-03-09T08:00:00+11:00",
        "departureTimeEstimated": "2026-03-09T08:02:00+11:00",
        "arrivalTimePlanned": "2026-03-09T08:42:00+11:00",
        "duration": 2400
      }
    ],
    "duration": 2520,
    "interchanges": 0
  }
]
```

**Cache-Control**: `public, max-age=300`

---

### GET /api/v1/trip-planner/stop-finder

Search stops/stations by name (v1 API).

| Param   | Type   | Required | Description                          |
|---------|--------|----------|--------------------------------------|
| `query` | string | ✓        | Search term. Format depends on `type` (see below). |
| `type`  | string | No       | `any` (default), `stop`, `poi`, `coord` |

**Important:** `type` defines the expected `query` format. Use `any` for free-text name search.

| type   | query format              | Example                          |
|--------|---------------------------|----------------------------------|
| `any`  | Any text (name, partial)   | `Circular Quay`, `Wynyard`       |
| `stop` | Stop ID only (numeric)    | `200060`, `10101100`             |
| `coord`| `lon:lat:EPSG:4326`       | `151.206:-33.884:EPSG:4326`      |
| `poi`  | Restrictive; prefer `any`  | —                                |

```http
GET /api/v1/trip-planner/stop-finder?query=Circular+Quay
X-API-Key: nsw_xxx
```

Stop ID lookup:
```http
GET /api/v1/trip-planner/stop-finder?query=200060&type=stop
X-API-Key: nsw_xxx
```

**Response** `200` — array of `Stop`
```json
[
  {
    "id": "200060",
    "name": "Circular Quay Station",
    "disassembledName": "Circular Quay",
    "lat": -33.861,
    "lon": 151.211,
    "type": "stop",
    "transportMode": "1,4"
  }
]
```

**Cache-Control**: `public, max-age=3600`

---

### GET /api/v1/trip-planner/departures

Departure board for a stop.

| Param      | Type   | Required | Description         |
|------------|--------|----------|---------------------|
| `stopId`   | string | No*      | Stop ID             |
| `stopName` | string | No*      | Stop name search    |
| `itdDate`  | string | No       | Date `YYYYMMDD`     |
| `itdTime`  | string | No       | Time `HHmm`         |

```http
GET /api/v1/trip-planner/departures?stopId=200060
X-API-Key: nsw_xxx
```

**Response** `200`
```json
[
  {
    "stopName": "Circular Quay Station",
    "stopId": "200060",
    "lineName": "T1",
    "destination": "Emu Plains",
    "departureTimePlanned": "2026-03-09T08:10:00+11:00",
    "departureTimeEstimated": "2026-03-09T08:12:00+11:00",
    "transportMode": "Sydney Trains Network",
    "platform": "Platform 1"
  }
]
```

**Cache-Control**: `public, max-age=30`

---

### GET /api/v1/trip-planner/nearby

Find stops near a coordinate.

| Param    | Type   | Required | Description            |
|----------|--------|----------|------------------------|
| `lat`    | number | ✓        | Latitude               |
| `lon`    | number | ✓        | Longitude              |
| `radius` | number | No       | Search radius in metres (default 500) |

```http
GET /api/v1/trip-planner/nearby?lat=-33.865&lon=151.209&radius=300
X-API-Key: nsw_xxx
```

**Response** `200` — array of `Stop` (same shape as `/stop-finder`)

**Cache-Control**: `public, max-age=3600`

---

## Stations

### GET /api/v1/stations/search

Search stations by name from the local GTFS static database.

| Param   | Type   | Required | Description             |
|---------|--------|----------|-------------------------|
| `query` | string | ✓        | Text search             |
| `limit` | number | No       | Max results (default 20)|

```http
GET /api/v1/stations/search?query=wynyard&limit=5
X-API-Key: nsw_xxx
```

**Response** `200`
```json
[
  {
    "stopId": "2000001",
    "stopName": "Wynyard Station",
    "lat": -33.866,
    "lon": 151.205,
    "locationType": 1,
    "wheelchairBoarding": 1,
    "platformCode": null,
    "mode": "sydneytrains"
  }
]
```

**Cache-Control**: `public, max-age=3600`

---

### GET /api/v1/stations/:stopId

Get a station by its GTFS stop ID.

```http
GET /api/v1/stations/2000001
X-API-Key: nsw_xxx
```

**Response** `200` — single `Station` object (same shape as search), or `404`

---

### GET /api/v1/stations/nearby

Find stations within a radius.

| Param    | Type   | Required | Description                    |
|----------|--------|----------|--------------------------------|
| `lat`    | number | ✓        | Latitude                       |
| `lon`    | number | ✓        | Longitude                      |
| `radius` | number | No       | Metres (default 500)           |
| `limit`  | number | No       | Max results (default 20)       |

```http
GET /api/v1/stations/nearby?lat=-33.866&lon=151.205&radius=400
X-API-Key: nsw_xxx
```

**Cache-Control**: `public, max-age=3600`

---

## GTFS Static

### GET /api/v1/gtfs-static/routes

```http
GET /api/v1/gtfs-static/routes?mode=metro&limit=50
X-API-Key: nsw_xxx
```

**Response** `200`
```json
[
  { "routeId": "M1", "routeShortName": "M1", "routeLongName": "Tallawong to Sydenham", "routeType": 1, "routeColor": "009B77", "mode": "metro" }
]
```

**Cache-Control**: `public, max-age=86400`

---

### GET /api/v1/gtfs-static/stops

```http
GET /api/v1/gtfs-static/stops?mode=ferries&limit=100
X-API-Key: nsw_xxx
```

---

### GET /api/v1/gtfs-static/trips

```http
GET /api/v1/gtfs-static/trips?routeId=M1&limit=20
X-API-Key: nsw_xxx
```

---

## GTFS Static Ingestion (admin)

### POST /api/v1/gtfs-static/ingest

Triggers a full GTFS static download + database import for all modes.
This operation is also run automatically on a weekly cron schedule.

```http
POST /api/v1/gtfs-static/ingest
X-API-Key: nsw_xxx
```

**Response** `200`
```json
[
  { "mode": "sydneytrains", "success": true },
  { "mode": "buses", "success": true },
  ...
]
```

---

## Error Responses

All errors follow this shape:

```json
{
  "statusCode": 401,
  "message": "Missing API key. Provide X-API-Key: nsw_xxx header.",
  "timestamp": "2026-03-09T00:00:00.000Z"
}
```

| Status | Meaning                                  |
|--------|------------------------------------------|
| `400`  | Bad request / validation error           |
| `401`  | Missing or invalid API key               |
| `404`  | Resource not found                       |
| `429`  | Rate limit exceeded (120 req/min)        |
| `500`  | NSW API error or internal server error   |
| `503`  | NSW API unavailable (upstream 503/504)   |
