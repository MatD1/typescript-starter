import { Injectable, Inject, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { RealtimeService } from './realtime.service';
import { PUB_SUB } from './pubsub.provider';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import type { TransportMode } from '../transport/transport.types';

@Injectable()
export class RealtimePollerService {
    private readonly logger = new Logger(RealtimePollerService.name);

    // Trip ID -> { refCount, mode? }
    private subscribedTrips = new Map<string, { count: number; mode?: TransportMode }>();

    constructor(
        private readonly realtimeService: RealtimeService,
        @Inject(PUB_SUB) private readonly pubSub: RedisPubSub,
    ) { }

    addTrip(tripId: string, mode?: TransportMode) {
        const existing = this.subscribedTrips.get(tripId);
        if (existing) {
            this.subscribedTrips.set(tripId, { count: existing.count + 1, mode: mode ?? existing.mode });
        } else {
            this.subscribedTrips.set(tripId, { count: 1, mode });
            // Trigger an immediate initial fetch when a new trip is added via async delay 
            // so we don't block the connection from completing.
            setTimeout(() => {
                this.pollSingleTrip(tripId, mode).catch(err => {
                    this.logger.error(`Error initial polling trip ${tripId}: ${err.message}`);
                });
            }, 0);
        }
    }

    removeTrip(tripId: string) {
        const existing = this.subscribedTrips.get(tripId);
        if (existing && existing.count > 1) {
            this.subscribedTrips.set(tripId, { count: existing.count - 1, mode: existing.mode });
        } else {
            this.subscribedTrips.delete(tripId);
        }
    }

    @Interval(15_000)
    async pollActiveTrips() {
        const trips = Array.from(this.subscribedTrips.entries());
        if (trips.length === 0) return;

        this.logger.debug(`Polling ${trips.length} active trip(s) for realtime updates`);

        // Process in parallel to reduce overall delay, but we could chunk if it gets too large
        await Promise.allSettled(
            trips.map(([tripId, { mode }]) => this.pollSingleTrip(tripId, mode))
        );
    }

    private async pollSingleTrip(tripId: string, mode?: TransportMode) {
        try {
            const data = await this.realtimeService.trackTrip(tripId, mode);
            if (data) {
                await this.pubSub.publish(`trackTrip:${tripId}`, { trackTrip: data });
            }
        } catch (error) {
            this.logger.error(`Failed to poll realtime data for trip ${tripId}: ${String(error)}`);
        }
    }
}
