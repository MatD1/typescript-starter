# NSW Transport API

A fully-functional **GraphQL + REST** wrapper for the [NSW Open Data Transport](https://opendata.transport.nsw.gov.au/) system. Built with **NestJS**, it covers all transport modes (Sydney Trains, Metro, Buses, Ferries, Light Rail, Intercity, NSW Trains) and provides live vehicle positions, trip planning, departure boards, station search, and service disruptions — all behind a unified, authenticated API.

## Features

| Category | Capability |
|---|---|
| **Auth** | `better-auth` email/password + Supabase SSO JWT exchange |
| **API Keys** | Create, list, revoke per-user API keys; all transport endpoints require `X-API-Key` |
| **Realtime** | Live vehicle positions & trip updates (GTFS-RT protobuf, all modes) |
| **Disruptions** | Service alerts from GTFS-RT alerts feed |
| **Trip Planner** | Journey planning, departure monitor, stop finder, coordinate search |
| **Stations** | Stop search by name, lookup by ID, nearby stops by lat/lon |
| **GTFS Static** | Timetable data (routes, stops, trips, calendars) ingested nightly at 3 AM |
| **Caching** | Valkey/Redis-backed with per-resource TTLs (15 s to 24 h) |
| **Docs** | Swagger UI at `/api/docs` · GraphQL Playground at `/graphql` |

## Transport Modes

`sydneytrains` · `intercity` · `buses` · `nswtrains` · `ferries` · `metro` · `lightrail`

---

## Quick Start

### Prerequisites

- Node.js >= 20
- PostgreSQL database
- Valkey / Redis instance

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Run database migrations

```bash
npm run db:generate   # Generate migration files from schema
npm run db:migrate    # Apply migrations
```

### 4. Start the server

```bash
npm run start:dev     # Development (watch mode)
npm run build && npm run start:prod  # Production
```

The API will be available at:
- **REST**: `http://localhost:3000/api/v1`
- **GraphQL**: `http://localhost:3000/graphql`
- **Swagger UI**: `http://localhost:3000/api/docs`

---

## Authentication

### Step 1 — Register / Login

```bash
# Register
POST /auth/sign-up/email
{ "email": "user@example.com", "password": "secret", "name": "My Name" }

# Login — returns { "token": "<session-token>", ... }
POST /auth/sign-in/email
{ "email": "user@example.com", "password": "secret" }
```

### Step 2 — Create an API Key

```bash
POST /api/v1/auth/api-keys
Authorization: Bearer <session-token>
{ "name": "my-app-key" }
# Returns { "key": "nsw_...", ... }
```

### Step 3 — Call Transport Endpoints

```bash
GET /api/v1/realtime/vehicles?mode=sydneytrains
X-API-Key: nsw_...
```

Alternatively pass it as `Authorization: Bearer nsw_...`.

### Supabase SSO

```bash
POST /auth/supabase/exchange
Authorization: Bearer <supabase-jwt>
# Returns { "token": "<better-auth-session-token>", ... }
```

---

## REST API Reference

All endpoints (except `/auth/*`) are under `/api/v1` and require `X-API-Key`.

### Realtime
| Method | Path | Description |
|---|---|---|
| GET | `/realtime/vehicles` | Live vehicle positions (all modes, or `?mode=`) |
| GET | `/realtime/vehicles/:mode` | Positions for a specific mode |
| GET | `/realtime/trip-updates` | Active trip updates |
| GET | `/realtime/trip-updates/:mode` | Trip updates for a specific mode |

### Disruptions
| Method | Path | Description |
|---|---|---|
| GET | `/disruptions` | All active service alerts |
| GET | `/disruptions/:mode` | Alerts for a specific mode |

### Trip Planner
| Method | Path | Description |
|---|---|---|
| GET | `/trip-planner/plan` | Plan a journey (`?from=&to=&time=`) |
| GET | `/trip-planner/departures` | Departure board for a stop |
| GET | `/trip-planner/stop-finder` | Search stops by name |
| GET | `/trip-planner/coord` | Stops near coordinates |

### Stations
| Method | Path | Description |
|---|---|---|
| GET | `/stations/search` | Search stations by name (`?q=`) |
| GET | `/stations/:stopId` | Lookup station by GTFS stop ID |
| GET | `/stations/nearby` | Nearby stops (`?lat=&lon=&radius=`) |

### GTFS Static
| Method | Path | Description |
|---|---|---|
| GET | `/gtfs-static/routes` | All routes (`?mode=`) |
| GET | `/gtfs-static/stops` | All stops (`?mode=`) |
| GET | `/gtfs-static/trips` | Trips (`?routeId=`) |
| GET | `/gtfs-static/calendar` | Service calendars |
| POST | `/gtfs-static/ingest/:mode` | Trigger GTFS ingest for a mode |

### API Key Management
| Method | Path | Description |
|---|---|---|
| POST | `/auth/api-keys` | Create a new API key |
| GET | `/auth/api-keys` | List your API keys |
| DELETE | `/auth/api-keys/:id` | Revoke an API key |

---

## GraphQL

The playground is at `/graphql`. All queries require the `X-API-Key` header.

```graphql
query {
  vehiclePositions(mode: "sydneytrains") {
    vehicleId
    routeId
    latitude
    longitude
    speed
    timestamp
  }
}
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Valkey/Redis connection string |
| `NSW_TRANSPORT_API_KEY` | NSW Open Data API token |
| `NSW_TRANSPORT_BASE_URL` | NSW API base URL (`https://api.transport.nsw.gov.au`) |
| `PORT` | Server port (default: `3000`) |
| `BETTER_AUTH_SECRET` | Secret for better-auth token signing |
| `BETTER_AUTH_URL` | Public URL of this server |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_JWT_SECRET` | Supabase JWT secret (from project settings) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |

---

## Database Scripts

```bash
npm run db:generate   # Generate Drizzle migration files from schema changes
npm run db:migrate    # Apply pending migrations
npm run db:push       # Push schema directly (dev only)
npm run db:studio     # Open Drizzle Studio (DB GUI)
```

---

## Caching TTLs

| Resource | TTL |
|---|---|
| Vehicle positions | 15 seconds |
| Trip updates / departures | 30 seconds |
| Disruptions / alerts | 5 minutes |
| Trip plans | 5 minutes |
| Stop searches | 1 hour |
| GTFS static queries | 24 hours |

---

## GTFS Static Ingestion

Static GTFS data is stored in PostgreSQL and refreshed nightly at **3:00 AM**. Trigger manually:

```bash
POST /api/v1/gtfs-static/ingest/sydneytrains
X-API-Key: nsw_...
```

---

## Running Tests

```bash
npm run test          # Unit tests
npm run test:e2e      # e2e tests (requires running DB + Redis)
npm run test:cov      # Coverage report
```

## License

MIT
