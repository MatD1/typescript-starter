# Technology Stack - NSW Transport API

## Core Languages & Runtimes
- **TypeScript:** Primary programming language for all application logic, ensuring type safety and developer productivity.
- **Node.js (>=20.0.0):** Execution runtime for the backend services.

## Backend Frameworks
- **NestJS:** Modular framework for building efficient, scalable server-side applications.
    - **REST API:** Implemented using `@nestjs/platform-express`.
    - **GraphQL:** Implemented using `@nestjs/graphql` and `@apollo/server`.
- **Drizzle ORM:** TypeScript ORM for interacting with the PostgreSQL database, providing a type-safe and performant query builder.

## Data Storage & Caching
- **PostgreSQL:** Primary relational database for storing static GTFS data (routes, stops, trips), user accounts, and API keys.
- **Redis (Valkey):** High-performance, in-memory data store used for caching real-time vehicle positions, trip updates, and session data. Accessed via `ioredis`.

## Authentication & Security
- **Better-Auth:** Comprehensive authentication library for managing user sign-ups, logins, and session persistence.
- **Supabase SSO:** Integration for exchanging Supabase JWTs for application-specific session tokens.
- **API Keys:** Custom management system for server-to-server and trusted application access.
- **Jose:** Library for JWT signing and verification.

## Communication & Protocols
- **Axios:** HTTP client for making requests to the upstream NSW Open Data APIs.
- **GTFS-RT Bindings:** `gtfs-realtime-bindings` for decoding Protocol Buffer data from real-time transport feeds.
- **Swagger:** `@nestjs/swagger` for automatic REST API documentation and interactive UI.

## Development & Testing
- **Jest:** Testing framework for unit, integration, and e2e tests.
- **Prettier & ESLint:** Tools for maintaining code consistency and quality.
- **Drizzle Kit:** CLI tool for database migrations and schema management.
