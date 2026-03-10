# NSW Transport API — Architecture

## Overview

A NestJS application that wraps the NSW Open Data Transport APIs, exposing a
dual GraphQL + REST interface. Authentication uses `better-auth` (email/password
or Supabase JWT exchange). Transport endpoints accept Bearer session tokens or API keys (for server-to-server use).

---

## Module Dependency Graph

```
AppModule
├── ConfigModule (global)
├── ScheduleModule
├── ThrottlerModule ──────────────────── Redis
├── DatabaseModule ───────────────────── PostgreSQL (Drizzle ORM)
├── CacheModule ──────────────────────── Redis (ioredis)
├── AuthModule
│   ├── AuthService          (better-auth sign-up / sign-in)
│   ├── SupabaseAuthService  (JWT exchange → session token)
│   ├── ApiKeyService        (create / verify / revoke API keys)
│   └── ApiKeyGuard          (global HTTP + GraphQL auth guard)
├── GraphQLModule ────────────────────── Apollo Server (code-first)
├── TransportModule
│   ├── TransportService     (raw NSW HTTP client)
│   └── GtfsRealtimeService  (protobuf decoder + field mapper)
├── RealtimeModule
│   ├── RealtimeResolver     (GraphQL)
│   ├── RealtimeController   (REST)
│   └── RealtimeService      (fan-out + Redis cache)
├── DisruptionsModule
│   ├── DisruptionsResolver  (GraphQL)
│   ├── DisruptionsController(REST)
│   └── DisruptionsService   (fan-out + Redis cache)
├── TripPlannerModule
│   ├── TripPlannerResolver  (GraphQL)
│   ├── TripPlannerController(REST)
│   └── TripPlannerService   (mapped journey planner + cache)
├── StationsModule
│   ├── StationsResolver     (GraphQL)
│   ├── StationsController   (REST)
│   └── StationsService      (DB-backed stop search + cache)
└── GtfsStaticModule
    ├── GtfsStaticResolver   (GraphQL)
    ├── GtfsStaticController (REST)
    ├── GtfsStaticService    (GTFS ZIP ingestion + DB queries)
    └── GtfsStaticScheduler  (weekly cron ingestion)
```

---

## Request Data Flow

### Authenticated REST request
```
Client (Flutter app, server, etc.)
  │  Authorization: Bearer <session-token>  OR  X-API-Key: nsw_xxx
  ▼
Express (compression middleware)
  │
  ▼
ApiKeyGuard
  │  If Bearer nsw_xxx → verifyApiKey() [cache 60s]
  │  If Bearer <other> → getUserFromSession() [cache 120s]
  │  If X-API-Key → verifyApiKey() [cache 60s]
  ▼
ThrottlerGuard  (120 req/min per key, Redis-backed)
  ▼
Controller / Resolver
  ▼
Service.getXxx()
  │  cache.getOrSet(key, factory, ttl)
  │     hit  ──▶  return cached JSON
  │     miss ──▶  TransportService.getGtfsRealtime(feedType, mode)
  │                 ├── buildGtfsRtUrl() → NSW API URL
  │                 └── GET /v{1,2}/gtfs/... (Accept: protobuf)
  │              GtfsRealtimeService.decode()
  │                 ├── nsw-proto.loader.decodeFeedMessage()
  │                 └── normalizeEntity() (remap namespaced extension keys)
  │              cache.set(result, ttl)
  ▼
JSON response  (Cache-Control: public, max-age=N)
```

### Supabase authentication flow (Flutter)
```
Flutter (supabase_flutter)
  │  1. User signs in via Supabase
  │  2. Supabase returns JWT
  ▼
POST /auth/supabase/exchange  { token: "<supabase-jwt>" }
  │  SupabaseAuthService.exchangeSupabaseToken()
  │    ├── jwt.verify(token, SUPABASE_JWT_SECRET)
  │    ├── upsert user in `users` table
  │    └── INSERT session → returns { sessionToken, refreshToken, expiresAt, userId }
  ▼
Option A: Use Bearer <sessionToken> on transport endpoints (1h expiry, refresh before)
Option B: POST /api/v1/api-keys  Authorization: Bearer <sessionToken>
  │    └── returns { key: "nsw_xxx...", id, start }
  ▼
Store nsw_xxx in Flutter secure storage; use X-API-Key for server-to-server
```

---

## Caching Strategy

| Cache key pattern           | TTL    | Invalidated by      |
|-----------------------------|--------|---------------------|
| `realtime:vehicles:{mode}`  | 15 s   | TTL expiry          |
| `realtime:tripupdates:{mode}` | 30 s | TTL expiry          |
| `disruptions:{mode}`        | 300 s  | TTL expiry          |
| `tripplanner:trip:{hash}`   | 300 s  | TTL expiry          |
| `tripplanner:departures:{hash}` | 30 s | TTL expiry        |
| `tripplanner:stops:{hash}`  | 3600 s | TTL expiry          |
| `tripplanner:coord:{hash}`  | 3600 s | TTL expiry          |
| `stations:search:{q}:{limit}` | 3600 s | TTL expiry        |
| `stations:id:{stopId}`      | 3600 s | TTL expiry          |
| `stations:nearby:{lat}:{lon}:{r}` | 3600 s | TTL expiry    |
| `apikey:verify:{key}`       | 60 s   | `revokeApiKey()`    |
| `session:user:{token}`      | 120 s  | TTL expiry          |

All cache entries are stored in Redis as JSON strings via `CacheService`.

---

## NSW API Version Mapping

| Feed type     | Mode           | External URL                                          |
|---------------|----------------|-------------------------------------------------------|
| tripupdates   | sydneytrains   | `v2/gtfs/realtime/sydneytrains`                       |
| tripupdates   | metro          | `v2/gtfs/realtime/metro`                              |
| tripupdates   | lightrail      | `v2/gtfs/realtime/lightrail`                          |
| tripupdates   | buses          | `v1/gtfs/realtime/buses`                              |
| tripupdates   | ferries        | `v1/gtfs/realtime/ferries`                            |
| tripupdates   | nswtrains      | `v1/gtfs/realtime/nswtrains`                          |
| tripupdates   | intercity      | `v1/gtfs/realtime/intercity`                          |
| vehiclepos    | any            | `v2/gtfs/vehiclepos/{mode}`                           |
| alerts        | any            | `v2/gtfs/alerts/{mode}`                               |
| schedule      | sydneytrains   | `v1/gtfs/schedule/sydneytrains` (static ZIP)          |
| trip planner  | —              | `v2/tp/trip`                                          |
| stop finder   | —              | `v2/tp/stop_finder`                                   |
| departures    | —              | `v2/tp/departure_mon`                                 |
| coord search  | —              | `v2/tp/coord`                                         |

---

## NSW Proto Extension Fields

The NSW GTFS-RT feed uses a custom proto2 extension
(`gtfs-realtime_1007_extension.proto`). Extension fields are decoded with
the following normalisation:

| Raw protobufjs key                             | Normalised key             | Location         |
|------------------------------------------------|----------------------------|------------------|
| `.transit_realtime.consist`                    | `consist`                  | VehiclePosition  |
| `.transit_realtime.tfnswVehicleDescriptor`     | `tfnswVehicleDescriptor`   | VehicleDescriptor|
| `.transit_realtime.trackDirection`             | `trackDirection`           | VehiclePosition  |
| `.transit_realtime.carriageSeqPredictiveOccupancy` | `carriageSeqPredictiveOccupancy` | StopTimeUpdate |
| `ttsHeaderText` (plain)                        | `ttsHeaderText`            | Alert            |
| `ttsDescriptionText` (plain)                   | `ttsDescriptionText`       | Alert            |
| `severityLevel` (plain)                        | `severityLevel`            | Alert            |

---

## Rate Limiting

- **Global**: 120 requests per 60 seconds per API key
- **Storage**: Redis-backed (`nestjs-throttler-storage-redis`)
- **Skip**: Auth endpoints (`@Public()` routes bypass both auth guard and throttler)
- **GraphQL complexity**: max 1000 (sum of field weights, default 1 each)
- **GraphQL depth**: max 8 levels of field nesting

---

## Environment Variables

| Variable                  | Required | Default                          | Description                              |
|---------------------------|----------|----------------------------------|------------------------------------------|
| `DATABASE_URL`            | ✓        | —                                | PostgreSQL connection string             |
| `REDIS_URL`               |          | `redis://localhost:6379`         | Redis connection URL                     |
| `BETTER_AUTH_SECRET`      | ✓        | —                                | Secret for better-auth session signing   |
| `BETTER_AUTH_URL`         |          | `http://localhost:3000`          | Public URL of this service               |
| `NSW_TRANSPORT_API_KEY`   | ✓        | —                                | NSW Open Data API key                    |
| `NSW_TRANSPORT_BASE_URL`  |          | `https://api.transport.nsw.gov.au` | NSW API base URL                       |
| `SUPABASE_URL`            | ✓ (SSO)  | —                                | Supabase project URL                     |
| `SUPABASE_JWT_SECRET`     | ✓ (SSO)  | —                                | Supabase JWT secret for token exchange   |
| `SESSION_TTL_SECONDS`     |          | `3600`                           | Session token lifetime (1 hour)          |
| `REFRESH_TOKEN_TTL_SECONDS`|         | `604800`                         | Refresh token lifetime (7 days)          |
| `ALLOWED_ORIGINS`         |          | `*`                              | Comma-separated CORS allowed origins     |
| `PORT`                    |          | `3000`                           | HTTP server port                         |
| `NODE_ENV`                |          | `development`                    | Set to `production` to disable playground|
