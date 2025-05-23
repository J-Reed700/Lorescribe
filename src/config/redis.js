import 'dotenv/config';

const isDevelopment = process.env.NODE_ENV === 'development';

const redisConfig = {
    host: 'redis',
    port: 6379
};

// Construct Redis URL for Bull queue
const constructRedisUrl = () => {
    return 'redis://redis:6379';
};

// Redis options for Bull
export const redisOptions = {
    redis: {
        port: redisConfig.port,
        host: redisConfig.host,
        retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
        }
    }
};

export const redisUrl = constructRedisUrl();
export default redisConfig; 