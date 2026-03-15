# Implementation Plan: Enrich Trip Planner with Route Metadata

This plan follows the TDD workflow and ensures consistent enrichment of trip planning results with GTFS route metadata (`lineCode` and `routeColour`).

## Phase 1: DTO and Schema Updates

- [ ] Task: Update `DepartureObject` and `LegObject` DTOs
    - [ ] Write tests to verify the presence of `lineCode` and `routeColour` in the DTOs
    - [ ] Add `lineCode` and `routeColour` fields to `DepartureObject` in `src/trip-planner/dto/trip-planner.objects.ts`
    - [ ] Add `lineCode` and `routeColour` fields to `LegObject` in `src/trip-planner/dto/trip-planner.objects.ts`
    - [ ] Update Swagger decorators for both objects with appropriate descriptions
    - [ ] Verify coverage (>80%)
    - [ ] Commit changes
    - [ ] Attach task summary with Git notes
    - [ ] Record task commit SHA in `plan.md`
    - [ ] Commit plan update

- [ ] Task: Conductor - User Manual Verification 'Phase 1: DTO and Schema Updates' (Protocol in workflow.md)

## Phase 2: Enrichment Logic Implementation

- [ ] Task: Implement Metadata Enrichment in `TripPlannerService`
    - [ ] Write failing unit tests in `src/trip-planner/trip-planner.service.spec.ts` for metadata lookup
    - [ ] Modify `TripPlannerService.mapDepartures` to fetch and apply route metadata
    - [ ] Modify `TripPlannerService.mapLeg` to fetch and apply route metadata
    - [ ] Ensure `GtfsStaticService.getRouteMetadataMap()` is utilized correctly
    - [ ] Handle missing `routeId` or metadata case (allow nulls)
    - [ ] Verify coverage (>80%)
    - [ ] Commit changes
    - [ ] Attach task summary with Git notes
    - [ ] Record task commit SHA in `plan.md`
    - [ ] Commit plan update

- [ ] Task: Conductor - User Manual Verification 'Phase 2: Enrichment Logic Implementation' (Protocol in workflow.md)

## Phase 3: GraphQL Verification & Final Testing

- [ ] Task: Verify GraphQL Schema and Resolver Integration
    - [ ] Write integration tests (or verify existing ones) to ensure GraphQL queries return the new fields
    - [ ] Run `npm run test:e2e` to confirm overall system integrity
    - [ ] Verify coverage (>80%)
    - [ ] Commit changes
    - [ ] Attach task summary with Git notes
    - [ ] Record task commit SHA in `plan.md`
    - [ ] Commit plan update

- [ ] Task: Conductor - User Manual Verification 'Phase 3: GraphQL Verification & Final Testing' (Protocol in workflow.md)
