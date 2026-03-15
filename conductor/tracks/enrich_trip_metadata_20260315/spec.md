# Specification: Enrich Trip Planner with Route Metadata

## Overview
Currently, the Trip Planner endpoints (Departures and Journey Planning) provide basic information about lines (e.g., `lineName`) but lack the specific `lineCode` (e.g., "T1") and `routeColour` (hex code) available in the real-time vehicle feeds. This track will enrich both `DepartureObject` and `LegObject` with these fields, ensuring consistency across the entire API and providing a better experience for frontend consumers.

## Functional Requirements
- **Update DTOs:**
    - Add `lineCode` (String) and `routeColour` (String) to `DepartureObject`.
    - Add `lineCode` (String) and `routeColour` (String) to `LegObject`.
- **Enrichment Logic:**
    - Modify `TripPlannerService` to fetch the Route Metadata Map from `GtfsStaticService`.
    - Map the incoming `routeId` (from NSW Open Data API) to the corresponding `lineCode` and `routeColour`.
    - Handle cases where `routeId` is missing or metadata is not found by allowing these fields to remain `null`.
- **GraphQL Support:**
    - Ensure the new fields are exposed in the GraphQL schema for both `DepartureObject` and `LegObject`.
- **API Documentation:**
    - Update Swagger definitions to include descriptions for the new fields.

## Non-Functional Requirements
- **Performance:** Ensure that the metadata lookup (which uses a cached map) does not significantly impact the latency of the trip planning or departure endpoints.
- **Maintainability:** Follow the established patterns for DTO definition and service enrichment used in the `realtime` module.

## Acceptance Criteria
- [ ] `GET /trip-planner/departures` returns `lineCode` and `routeColour` for each departure (where available).
- [ ] `GET /trip-planner/plan` returns `lineCode` and `routeColour` for each leg of the journey (where available).
- [ ] The GraphQL playground shows `lineCode` and `routeColour` as selectable fields for `departures` and `planTrip` queries.
- [ ] All automated tests pass, including new or updated tests for the enrichment logic.

## Out of Scope
- Modifying the underlying GTFS static ingestion process.
- Inferring colors based on transport mode if metadata is missing.
