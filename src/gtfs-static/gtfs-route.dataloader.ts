import { Injectable, Scope } from '@nestjs/common';
import DataLoader from 'dataloader';
import { GtfsStaticService } from './gtfs-static.service';

export interface RouteMetadata {
    lineCode?: string;
    routeColour?: string;
}

@Injectable({ scope: Scope.REQUEST })
export class RouteMetadataDataLoader {
    constructor(private readonly gtfsStaticService: GtfsStaticService) { }

    public readonly loader = new DataLoader<string, RouteMetadata | null>(
        async (tripIds: readonly string[]) => {
            const records = await this.gtfsStaticService.getRouteMetadataByTripIds(tripIds as string[]);
            const map = new Map<string, RouteMetadata>();
            for (const r of records) {
                map.set(r.tripId, { lineCode: r.lineCode, routeColour: r.routeColour });
            }
            return tripIds.map((id) => map.get(id) ?? null);
        },
    );
}
