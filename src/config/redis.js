import 'dotenv/config';

const isDevelopment = process.env.NODE_ENV === 'development';

const redisConfig = isDevelopment ? {
    // Local Redis configuration from docker-compose
    host: 'redis',
    port: 6379,
    username: undefined,
    password: undefined,
    tls: undefined
} : {
    // DigitalOcean Redis configuration
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS_ENABLED === 'true' ? {
        rejectUnauthorized: false // Required for DigitalOcean managed databases
    } : undefined
};

// Construct Redis URL for Bull queue
const constructRedisUrl = () => {
    if (isDevelopment) {
        return 'redis://redis:6379';
    }

    const auth = redisConfig.username ? 
        `${redisConfig.username}:${redisConfig.password}` : 
        redisConfig.password;
    
    const protocol = redisConfig.tls ? 'rediss' : 'redis';
    return `${protocol}://${auth}@${redisConfig.host}:${redisConfig.port}`;
};

// Redis options for Bull
export const redisOptions = {
    redis: {
        port: redisConfig.port,
        host: redisConfig.host,
        username: redisConfig.username,
        password: redisConfig.password,
        tls: redisConfig.tls,
        retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
        }
    }
};

export const redisUrl = constructRedisUrl();
export default redisConfig; 