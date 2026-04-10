import { ConfigService } from '@nestjs/config';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import Redis from 'ioredis';

export const PUB_SUB = 'PUB_SUB';

export const pubSubProvider = {
    provide: PUB_SUB,
    inject: [ConfigService],
    useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('redis.url') ?? 'redis://localhost:6379';
        return new RedisPubSub({
            publisher: new Redis(redisUrl, { lazyConnect: true }),
            subscriber: new Redis(redisUrl, { lazyConnect: true }),
        });
    },
};
