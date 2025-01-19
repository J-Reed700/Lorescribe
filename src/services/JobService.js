import Queue from 'bull';
import logger from '../utils/logger.js';

export default class JobService {
    constructor(redisUrl) {
        this.queues = new Map();
        this.redisUrl = redisUrl;
        this.processors = new Map();
    }

    createQueue(name, processor) {
        if (this.queues.has(name)) {
            return this.queues.get(name);
        }

        const queue = new Queue(name, this.redisUrl, {
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000
                }
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

        queue.on('failed', (job, error) => {
            logger.error(`[JobService] Job failed in queue ${name}:`, {
                jobId: job.id,
                error: error.message,
                stack: error.stack,
                attempts: job.attemptsMade
            });
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
} 