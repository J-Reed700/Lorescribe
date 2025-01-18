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
const logger = require('../utils/logger');
const baseConfig = require('../config');
const { EventEmitter } = require('events');

class ServiceFactory {
    constructor(client, config) {
        this.client = client;
        this.config = config;
        this.container = new Container();
    }

    async initialize() {
        try {
            // Register basic services
            this.container.register('client', this.client);
            this.container.register('config', new ConfigurationService(this.config));
            this.container.register('logger', logger);
            this.container.register('events', new EventEmitter());

            // Register core services
            this.container.register('voiceState', new VoiceStateService(this.container));
            this.container.register('audio', new AudioService(this.container));
            this.container.register('storage', new StorageService(this.container));

            // Initialize OpenAI
            const openai = new OpenAI({
                apiKey: this.config.OPENAI_API_KEY
            });

            // Register OpenAI dependent services
            this.container.register('transcription', new TranscriptionService(openai, this.config));

            // Initialize and register job service with authentication
            const mongoUri = `mongodb://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@mongodb:27017/${baseConfig.MONGODB_DATABASE}?authSource=admin`;
            const jobService = new JobService(mongoUri);
            this.container.register('jobs', jobService);

            logger.info('[ServiceFactory] Services initialized successfully');
            return this.container;
        } catch (error) {
            logger.error('[ServiceFactory] Failed to initialize services:', error);
            throw error;
        }
    }

    async shutdown() {
        try {
            // Get job service and shut it down properly
            const jobService = this.container.get('jobs');
            if (jobService) {
                await jobService.shutdown();
            }

            logger.info('[ServiceFactory] Services shut down successfully');
        } catch (error) {
            logger.error('[ServiceFactory] Error during service shutdown:', error);
            throw error;
        }
    }
}

module.exports = ServiceFactory; 