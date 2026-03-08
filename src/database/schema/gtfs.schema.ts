import {
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const gtfsStop = pgTable(
  'gtfs_stops',
  {
    stopId: text('stop_id').primaryKey(),
    stopCode: text('stop_code'),
    stopName: text('stop_name').notNull(),
    stopLat: doublePrecision('stop_lat'),
    stopLon: doublePrecision('stop_lon'),
    locationType: integer('location_type'),
    parentStation: text('parent_station'),
    wheelchairBoarding: integer('wheelchair_boarding'),
    platformCode: text('platform_code'),
    mode: text('mode'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('gtfs_stops_name_idx').on(t.stopName)],
);

export const gtfsRoute = pgTable('gtfs_routes', {
  routeId: text('route_id').primaryKey(),
  agencyId: text('agency_id'),
  routeShortName: text('route_short_name'),
  routeLongName: text('route_long_name'),
  routeType: integer('route_type'),
  routeColor: text('route_color'),
  routeTextColor: text('route_text_color'),
  mode: text('mode'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const gtfsTrip = pgTable(
  'gtfs_trips',
  {
    tripId: text('trip_id').primaryKey(),
    routeId: text('route_id'),
    serviceId: text('service_id'),
    tripHeadsign: text('trip_headsign'),
    tripShortName: text('trip_short_name'),
    directionId: integer('direction_id'),
    shapeId: text('shape_id'),
    wheelchairAccessible: integer('wheelchair_accessible'),
    mode: text('mode'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('gtfs_trips_route_idx').on(t.routeId)],
);

export const gtfsCalendar = pgTable('gtfs_calendar', {
  serviceId: text('service_id').primaryKey(),
  monday: integer('monday').notNull(),
  tuesday: integer('tuesday').notNull(),
  wednesday: integer('wednesday').notNull(),
  thursday: integer('thursday').notNull(),
  friday: integer('friday').notNull(),
  saturday: integer('saturday').notNull(),
  sunday: integer('sunday').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  mode: text('mode'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const gtfsCalendarDate = pgTable('gtfs_calendar_dates', {
  id: text('id').primaryKey(),
  serviceId: text('service_id').notNull(),
  date: text('date').notNull(),
  exceptionType: integer('exception_type').notNull(),
  mode: text('mode'),
});

export const gtfsStopTime = pgTable(
  'gtfs_stop_times',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id').notNull(),
    arrivalTime: text('arrival_time'),
    departureTime: text('departure_time'),
    stopId: text('stop_id').notNull(),
    stopSequence: integer('stop_sequence').notNull(),
    pickupType: integer('pickup_type'),
    dropOffType: integer('drop_off_type'),
    mode: text('mode'),
  },
  (t) => [
    index('gtfs_stop_times_trip_idx').on(t.tripId),
    index('gtfs_stop_times_stop_idx').on(t.stopId),
  ],
);
