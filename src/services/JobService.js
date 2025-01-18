const Agenda = require('agenda');
const logger = require('../utils/logger');

class JobService {
    constructor(mongoConnectionString) {
        this.agenda = new Agenda({
            db: { address: mongoConnectionString, collection: 'jobs' },
            processEvery: '30 seconds',
            maxConcurrency: 5
        });

        this.setupJobs();
    }

    async setupJobs() {
        // Define the summary generation job
        this.agenda.define('generateSummary', { retries: 3 }, async (job) => {
            const { guildId, transcript, services } = job.attrs.data;
            
            try {
                const transcriptionService = services.get('transcription');
                const storageService = services.get('storage');
                const configService = services.get('config');
                const events = services.get('events');

                // Attempt to generate summary
                const summary = await transcriptionService.generateSummary(transcript);
                const timestamp = Date.now();

                // Save the updated summary
                await storageService.saveTranscript(guildId, transcript, timestamp, summary);

                // Get guild config for summary channel
                const guildConfig = configService.getGuildConfig(guildId);
                if (guildConfig?.summaryChannelId) {
                    const client = services.get('client');
                    const channel = await client.channels.fetch(guildConfig.summaryChannelId);
                    if (channel) {
                        await channel.send({
                            content: `**Updated Summary** (Background Generated)\n\n${summary}\n\n`
                        });
                    }
                }

                // Emit success event
                events.emit('RECORDING_SUMMARIZED', {
                    guildId,
                    summary,
                    transcript,
                    timestamp,
                    isBackgroundGenerated: true
                });

                logger.info(`[JobService] Successfully generated summary for guild ${guildId}`);
            } catch (error) {
                logger.error(`[JobService] Failed to generate summary:`, error);
                throw error; // This will trigger Agenda's retry mechanism
            }
        });

        await this.agenda.start();
        logger.info('[JobService] Background job processor started');
    }

    async scheduleBackgroundSummary(guildId, transcript, services) {
        try {
            await this.agenda.schedule('in 1 minute', 'generateSummary', {
                guildId,
                transcript,
                services
            });
            logger.info(`[JobService] Scheduled summary generation for guild ${guildId}`);
        } catch (error) {
            logger.error(`[JobService] Failed to schedule summary generation:`, error);
            throw error;
        }
    }

    async shutdown() {
        await this.agenda.stop();
        logger.info('[JobService] Background job processor stopped');
    }
}

module.exports = JobService; 