import { registerEnumType } from '@nestjs/graphql';

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

/** GraphQL enum for transport mode — use in resolver @Args instead of String. */
export enum TransportModeEnum {
  sydneytrains = 'sydneytrains',
  intercity = 'intercity',
  buses = 'buses',
  nswtrains = 'nswtrains',
  ferries = 'ferries',
  metro = 'metro',
  lightrail = 'lightrail',
}

registerEnumType(TransportModeEnum, {
  name: 'TransportMode',
  description: 'NSW transport network mode',
  valuesMap: {
    sydneytrains: { description: 'Sydney Trains suburban network' },
    intercity: {
      description:
        'Intercity / regional rail (filtered from Sydney Trains feed by route)',
    },
    buses: { description: 'Sydney metropolitan buses' },
    nswtrains: { description: 'NSW TrainLink long-distance trains' },
    ferries: { description: 'Sydney Ferries' },
    metro: { description: 'Sydney Metro rapid transit' },
    lightrail: { description: 'Light rail (CBD, Inner West, Parramatta)' },
  },
});

/** GraphQL enum for stop finder type (v1 API type_sf). */
export enum StopFinderTypeEnum {
  any = 'any',
  coord = 'coord',
  poi = 'poi',
  stop = 'stop',
}

registerEnumType(StopFinderTypeEnum, {
  name: 'StopFinderType',
  description: 'Type of results for stop finder search (v1 API type_sf)',
  valuesMap: {
    any: {
      description:
        'All location types — use for free-text name search (e.g. "Wynyard")',
    },
    coord: {
      description:
        'Coordinate lookup — query must be lon:lat:EPSG:4326. Use "any" for name search.',
    },
    poi: {
      description:
        'Places of interest — restrictive. Use "any" for general name search.',
    },
    stop: {
      description:
        'Stop ID only (e.g. 200060) — not for name search. Use "any" for name search.',
    },
  },
});

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
  context?: string;
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
