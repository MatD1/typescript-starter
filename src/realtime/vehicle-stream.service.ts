import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Interval } from '@nestjs/schedule';
import { RealtimeService } from './realtime.service';
import { TRANSPORT_MODES } from '../transport/transport.types';
import type { TransportMode } from '../transport/transport.types';

@Injectable()
export class VehicleStreamService {
    private readonly logger = new Logger(VehicleStreamService.name);
    // One emitter per mode — subscribers listen to 'vehicles' event
    private readonly emitters = new Map<string, EventEmitter>();

    constructor(private readonly realtimeService: RealtimeService) {
        // Pre-create an emitter for every mode + the "all" key
        const keys = [...TRANSPORT_MODES, 'all'];
        for (const key of keys) {
            const emitter = new EventEmitter();
            emitter.setMaxListeners(500); // allow many concurrent SSE clients
            this.emitters.set(key, emitter);
        }
    }

    getEmitter(mode?: string): EventEmitter {
        return this.emitters.get(mode ?? 'all')!;
    }

    @Interval(15_000)
    async broadcastAll() {
        // Railway serverless decides idleness from outbound traffic. Do not poll
        // TfNSW when nobody is consuming an SSE vehicle stream.
        const allListeners = this.emitters.get('all')?.listenerCount('vehicles') ?? 0;
        const activeModes = TRANSPORT_MODES.filter((mode) =>
            allListeners > 0 ||
            (this.emitters.get(mode)?.listenerCount('vehicles') ?? 0) > 0,
        );
        if (activeModes.length === 0) return;

        await Promise.allSettled(
            activeModes.map((m) => this.broadcastMode(m as TransportMode)),
        );
    }

    private async broadcastMode(mode: TransportMode) {
        try {
            const vehicles = await this.realtimeService.getVehiclePositions(mode);
            const payload = JSON.stringify(vehicles);
            this.emitters.get(mode)?.emit('vehicles', payload);
            this.emitters.get('all')?.emit('vehicles', payload, mode);
            this.logger.debug(`Broadcasted ${vehicles.length} vehicles for mode: ${mode}`);
        } catch (err) {
            this.logger.error(`broadcastMode(${mode}) failed: ${err}`);
        }
    }
}
