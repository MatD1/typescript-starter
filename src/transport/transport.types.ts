export const TRANSPORT_MODES = [
  'sydneytrains',
  'intercity',
  'buses',
  'nswtrains',
  'ferries',
  'metro',
  'lightrail',
] as const;

export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const GTFS_RT_FEED_TYPES = [
  'vehiclepos',
  'tripupdates',
  'alerts',
] as const;
export type GtfsRtFeedType = (typeof GTFS_RT_FEED_TYPES)[number];

export interface TripPlannerParams {
  originName?: string;
  originCoord?: string;
  originId?: string;
  destName?: string;
  destCoord?: string;
  destId?: string;
  itdDate?: string;
  itdTime?: string;
  calcNumberOfTrips?: number;
  wheelchair?: boolean;
}

export interface StopFinderParams {
  name_sf?: string;
  coordOutputFormat?: string;
  outputFormat?: string;
  type_sf?: string;
}

export interface DepartureMonitorParams {
  name_dm?: string;
  type_dm?: string;
  departureMonitorMacro?: boolean;
  itdDate?: string;
  itdTime?: string;
  mode?: string;
  outputFormat?: string;
}

export interface CoordParams {
  coord?: string;
  coordOutputFormat?: string;
  inclFilter?: number;
  type_1?: string;
  radius_1?: number;
  outputFormat?: string;
}
