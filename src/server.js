import http from 'http';
import logger from './utils/logger.js';

export function startServer(services) {
    const port = process.env.PORT || 8080;
    
    const server = http.createServer(async (req, res) => {
        if (req.url === '/health' && req.method === 'GET') {
            try {
                // Check Discord connection
                const discordStatus = services.get('client').ws.status === 0;
                
                // Check Redis connection by pinging it
                let redisStatus = false;
                try {
                    const jobService = services.get('jobs');
                    const queue = jobService.createQueue('health-check', async () => {});
                    await queue.client.ping();
                    await queue.close();
                    redisStatus = true;
                } catch (error) {
                    logger.error('[Health Check] Redis check failed:', error);
                }

                const status = {
                    status: discordStatus && redisStatus ? 'healthy' : 'unhealthy',
                    discord: discordStatus,
                    redis: redisStatus,
                    timestamp: new Date().toISOString()
                };

                res.writeHead(status.status === 'healthy' ? 200 : 503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(status));
            } catch (error) {
                logger.error('[Health Check] Health check failed:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    status: 'error',
                    error: error.message,
                    timestamp: new Date().toISOString()
                }));
            }
            return;
        }

        // Handle all other routes
        res.writeHead(404);
        res.end();
    });

    server.listen(port, () => {
        logger.info(`Health check server listening on port ${port}`);
    });

    return server;
} 