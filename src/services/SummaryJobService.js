const RecordingEvents = require('../events/RecordingEvents');

class SummaryJobService {
    constructor(services) {
        this.transcriptionService = services.get('transcription');
        this.configService = services.get('config');
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
            
            this.logger.debug(`[SummaryJobService] Processing summary for guild ${guildId}`);
            
            try {
                const summary = await this.transcriptionService.generateSummary(transcript);
                const timestamp = Date.now();
                
                // Send to summary channel if configured
                const guildConfig = this.configService.getGuildConfig(guildId);
                if (guildConfig?.summaryChannelId) {
                    const channel = await this.client.channels.fetch(guildConfig.summaryChannelId);
                    if (channel) {
                        await channel.send({
                            content: `**Updated Summary** (Background Generated)\n\n${summary}\n\n`
                        });
                    }
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

    async scheduleSummaryGeneration(guildId, transcript) {
        try {
            await this.jobService.scheduleJob('summary-generation', {
                guildId,
                transcript
            }, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000
                },
                removeOnComplete: true
            });

            this.logger.debug(`[SummaryJobService] Scheduled summary generation for guild ${guildId}`);
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

module.exports = SummaryJobService; 