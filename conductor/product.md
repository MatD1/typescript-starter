# Initial Concept
A GraphQL + REST wrapper for the NSW Open Data Transport system.

# Product Guide - NSW Transport API

## Vision
A unified, high-performance GraphQL and REST API wrapper for the NSW Open Data Transport system. This project aims to democratize access to NSW transit data by providing a simplified, authenticated, and highly optimized interface for developers and enterprise systems.

## Target Users
- **External Developers:** Building third-party transit applications, maps, and notification services.
- **Internal/Enterprise Systems:** Integrating transit data into corporate dashboards, office IoT displays, or logistics platforms.

## Key Objectives
- **Real-time Performance:** Ensuring the lowest possible latency for live vehicle positions and trip updates through efficient GTFS-RT processing and multi-level caching.
- **Schema Simplification:** Abstracting the complexities of the underlying NSW Open Data schemas into a clean, modern, and intuitive API (REST & GraphQL).
- **Multi-modal Integration:** Providing a cohesive journey planning experience that seamlessly combines Sydney Trains, Metro, Buses, Ferries, Light Rail, and Intercity services.

## Core Features
- **Unified Authentication:** Robust security via `better-auth` (email/password), Supabase SSO JWT exchange, and granular API Key management for server-to-server communication.
- **Live Real-time Data:** Instant access to vehicle positions, trip updates, and service disruptions across all transport modes.
- **Advanced Trip Planning:** Comprehensive journey planning, coordinate-based stop searches, and live departure boards.
- **Automated Data Lifecycle:** Nightly ingestion of static GTFS data (timetable, routes, stops) to ensure the API is always up-to-date.
- **Optimized Caching:** Intelligent Valkey/Redis-backed caching with resource-specific TTLs to maximize responsiveness and minimize upstream API load.

## Future Direction
- **Historical Analytics:** Aggregating data to provide insights into transit line performance, punctuality trends, and peak usage patterns.
- **Personalization Features:** Introducing user-managed profiles for saved trips, favorite stations, and proactive push notifications for service alerts.
- **Geographic Expansion:** Extending the API architecture to support transit data from other regions (e.g., Victoria, Queensland) to create a broader transport data platform.
