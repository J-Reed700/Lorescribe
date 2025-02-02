import 'dotenv/config';

const redisConfig = {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS_ENABLED === 'true' ? {} : undefined
};

// Construct Redis URL for Bull queue
const constructRedisUrl = () => {
    const auth = redisConfig.username ? 
        `${redisConfig.username}:${redisConfig.password}` : 
        redisConfig.password;
    
    const protocol = redisConfig.tls ? 'rediss' : 'redis';
    return `${protocol}://${auth}@${redisConfig.host}:${redisConfig.port}`;
};

export const redisUrl = constructRedisUrl();
export default redisConfig; 