import RecordingEvents from '../events/RecordingEvents.js';
import logger from '../utils/logger.js';

export default class SummaryJobService {
    constructor(services) {
        this.transcriptionService = services.get('transcription');
        this.configService = services.get('config');
        this.channelService = services.get('channel');
        this.events = services.get('events');
        this.client = services.get('client');
        this.logger = services.get('logger');
        this.jobService = services.get('jobs');

        this.setupQueue();
    }

    setupQueue() {
        // Create the summary generation queue with its processor
        this.jobService.createQueue('summary-generation', async (job) => {
            const { guildId, transcript } = job.data;
            
            this.logger.info(`[SummaryJobService] Processing summary for guild ${guildId}`);
            
            try {
                const summary = await this.transcriptionService.generateSummary(transcript, guildId);
                const timestamp = Date.now();
                
                // Send to summary channel if configured
                const guildConfig = this.configService.getGuildConfig(guildId);
                if (guildConfig?.summaryChannelId) {
                    await this.channelService.sendMessage(guildConfig.summaryChannelId, {
                        content: `**Updated Summary** (Background Generated) JobId: ${job.id}\n\n${summary}\n\nJobId: ${job.id}`
                    });
                }

                // Emit success event
                this.events.emit(RecordingEvents.RECORDING_SUMMARIZED, {
                    guildId,
                    summary,
                    transcript,
                    timestamp,
                    isBackgroundGenerated: true
                });

                this.logger.info(`[SummaryJobService] Successfully generated background summary for guild ${guildId}`);
                
                return { success: true, guildId, timestamp };
            } catch (error) {
                this.logger.error(`[SummaryJobService] Failed to generate background summary:`, {
                    error: error.message,
                    stack: error.stack,
                    guildId
                });
                throw error;
            }
        });
    }

    async scheduleSummaryGeneration(guildId, transcript, delayMs = 0) {
        try {
            const job = await this.jobService.scheduleJob('summary-generation', {
                guildId,
                transcript
            }, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000
                },
                removeOnComplete: true,
                delay: delayMs 
            });
            this.logger.info(`[SummaryJobService] Scheduled summary generation for guild ${guildId} with ${delayMs}ms delay`);
            return job.id;
        } catch (error) {
            this.logger.error(`[SummaryJobService] Failed to schedule summary generation:`, {
                error: error.message,
                stack: error.stack,
                guildId
            });
            throw error;
        }
    }

    async dispose() {
        // The JobService will handle closing the queues
    }
} 