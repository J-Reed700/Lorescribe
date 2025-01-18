const { Client, GatewayIntentBits } = require('discord.js');
const { OpenAI } = require('openai');
const Container = require('./Container');
const VoiceRecorder = require('../VoiceRecorder');
const AudioService = require('./AudioService');
const TranscriptionService = require('./TranscriptionService');
const VoiceStateService = require('./VoiceStateService');
const StorageService = require('./StorageService');
const ConfigurationService = require('./ConfigurationService');
const JobService = require('./JobService');
const SummaryJobService = require('./SummaryJobService');
const logger = require('../utils/logger');
const baseConfig = require('../config');
const { EventEmitter } = require('events');

let containerInstance = null;

class ServiceFactory {
    constructor(config) {
        this.config = config;
        this.containerInstance = null;
    }

    async initialize() {
        if (this.containerInstance) {
            return this.containerInstance;
        }

        try {
            this.containerInstance = new Container();


            this.containerInstance.register('config', new ConfigurationService(this.config));
            this.containerInstance.register('logger', logger);
            this.containerInstance.register('events', new EventEmitter());

            this.containerInstance.register('client', new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildVoiceStates,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.GuildMembers,
                    GatewayIntentBits.GuildPresences,
                    GatewayIntentBits.GuildWebhooks,
                    GatewayIntentBits.GuildIntegrations,
                    GatewayIntentBits.GuildInvites,
                ]
            }));

            // Register core services
            this.containerInstance.register('voiceState', new VoiceStateService());
            this.containerInstance.register('storage', new StorageService(baseConfig));
            this.containerInstance.register('audio', new AudioService(
                this.containerInstance.get('voiceState'),
                this.containerInstance.get('storage'),
                logger
            ));

            // Initialize OpenAI
            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });

            // Register OpenAI dependent services
            this.containerInstance.register('transcription', new TranscriptionService(openai, this.config));

            // Initialize and register job services
            const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
            const jobService = new JobService(redisUrl);
            this.containerInstance.register('jobs', jobService);
            
            // Register summary job service
            this.containerInstance.register('summaryJobs', new SummaryJobService(this.containerInstance));

            // Register VoiceRecorder after all its dependencies
            this.containerInstance.register('voiceRecorder', new VoiceRecorder(this.containerInstance));

            logger.info('[ServiceFactory] Services initialized successfully');
            return this.containerInstance;
        } catch (error) {
            logger.error('[ServiceFactory] Failed to initialize services:', error);
            throw error;
        }
    }

    async shutdown() {
        try {
            if (!this.containerInstance) {
                return;
            }

            // Get services and shut them down properly
            const jobService = this.containerInstance.get('jobs');
            const summaryJobService = this.containerInstance.get('summaryJobs');

            if (summaryJobService) {
                await summaryJobService.dispose();
            }

            if (jobService) {
                await jobService.dispose();
            }

            this.containerInstance = null;
            logger.info('[ServiceFactory] Services shut down successfully');
        } catch (error) {
            logger.error('[ServiceFactory] Error during service shutdown:', error);
            throw error;
        }
    }
}

module.exports = ServiceFactory;