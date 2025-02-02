import Queue from 'bull';
import logger from '../utils/logger.js';
import { redisUrl } from '../config/redis.js';

export default class JobService {
    constructor() {
        this.queues = new Map();
        this.processors = new Map();
        this.failedJobsKey = 'failed_jobs';  // Redis key for failed jobs
    }

    createQueue(name, processor) {
        if (this.queues.has(name)) {
            return this.queues.get(name);
        }

        const queue = new Queue(name, redisUrl, {
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000
                }
            },
            redis: {
                tls: process.env.REDIS_TLS_ENABLED === 'true' ? { rejectUnauthorized: false } : undefined
            }
        });

        // Store the processor for reconnection scenarios
        this.processors.set(name, processor);

        // Set up processing
        this.setupQueueProcessing(queue, name, processor);

        this.queues.set(name, queue);
        return queue;
    }

    setupQueueProcessing(queue, name, processor) {
        // Set up the processor
        queue.process(async (job) => {
            try {
                logger.info(`[JobService] Processing job in queue ${name}:`, {
                    jobId: job.id,
                    data: job.data
                });
                return await processor(job);
            } catch (error) {
                logger.error(`[JobService] Error processing job in queue ${name}:`, {
                    jobId: job.id,
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        });

        // Handle events
        queue.on('completed', (job, result) => {
            logger.info(`[JobService] Job completed in queue ${name}:`, {
                jobId: job.id,
                result
            });
        });

        queue.on('failed', async (job, error) => {
            logger.error(`[JobService] Job failed in queue ${name}:`, {
                jobId: job.id,
                error: error.message,
                stack: error.stack,
                attempts: job.attemptsMade
            });

            // Log failed job to Redis
            await this.logFailedJob(name, job, error);
        });

        queue.on('error', (error) => {
            logger.error(`[JobService] Queue ${name} error:`, {
                error: error.message,
                stack: error.stack
            });
        });
    }

    async scheduleJob(queueName, data, options = {}) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        const job = await queue.add(data, {
            ...options,
            removeOnComplete: true
        });

        logger.info(`[JobService] Scheduled job in queue ${queueName}:`, {
            jobId: job.id,
            data
        });

        return job;
    }

    async dispose() {
        const closePromises = Array.from(this.queues.values()).map(async (queue) => {
            try {
                await queue.pause(true);
                await queue.close();
            } catch (error) {
                logger.error(`[JobService] Error closing queue:`, {
                    error: error.message,
                    stack: error.stack
                });
            }
        });

        await Promise.all(closePromises);
        this.queues.clear();
        this.processors.clear();
    }

    async logFailedJob(queueName, job, error) {
        try {
            const queue = this.queues.get(queueName);
            if (!queue) return;

            const failedJob = {
                id: job.id,
                queueName,
                timestamp: Date.now(),
                error: {
                    message: error.message,
                    stack: error.stack
                },
                data: job.data,
                attempts: job.attemptsMade,
                failedReason: job.failedReason
            };

            // Store in Redis with 30-day expiration
            await queue.client.hset(
                this.failedJobsKey,
                `${queueName}:${job.id}`,
                JSON.stringify(failedJob)
            );
            await queue.client.expire(this.failedJobsKey, 60 * 60 * 24 * 30); // 30 days

            logger.info(`[JobService] Logged failed job to Redis:`, {
                jobId: job.id,
                queueName
            });
        } catch (redisError) {
            logger.error(`[JobService] Error logging failed job to Redis:`, {
                jobId: job.id,
                queueName,
                error: redisError
            });
        }
    }

    async getFailedJobs(queueName = null) {
        try {
            const queue = queueName ? this.queues.get(queueName) : Array.from(this.queues.values())[0];
            if (!queue) return [];

            const failedJobs = await queue.client.hgetall(this.failedJobsKey);
            if (!failedJobs) return [];

            return Object.entries(failedJobs)
                .filter(([key]) => !queueName || key.startsWith(`${queueName}:`))
                .map(([_, value]) => JSON.parse(value))
                .sort((a, b) => b.timestamp - a.timestamp);
        } catch (error) {
            logger.error(`[JobService] Error retrieving failed jobs:`, error);
            return [];
        }
    }
} 