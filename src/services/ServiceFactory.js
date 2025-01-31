import { Client, Events, GatewayIntentBits } from 'discord.js';
import { OpenAI } from 'openai';
import Container from './Container.js';
import VoiceRecorder from '../VoiceRecorder.js';
import ChannelService from './ChannelService.js';
import AudioService from './AudioService.js';
import TranscriptionService from './TranscriptionService.js';
import VoiceStateService from './VoiceStateService.js';
import StorageService from './StorageService.js';
import ConfigurationService from './ConfigurationService.js';
import JobService from './JobService.js';
import SummaryJobService from './SummaryJobService.js';
import logger from '../utils/logger.js';
import baseConfig from '../config.js';
import { EventEmitter } from 'events';

export default class ServiceFactory {
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

            // Register basic services
            this.containerInstance.register('config', new ConfigurationService(this.config));
            this.containerInstance.register('logger', logger);
            this.containerInstance.register('events', new EventEmitter());

            // Create Discord client with all required intents
            const client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildVoiceStates,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.GuildMembers,
                    GatewayIntentBits.MessageContent,
                    GatewayIntentBits.GuildPresences,
                ],
                partials: ['MESSAGE', 'CHANNEL', 'REACTION']
            });

            client.once(Events.ClientReady, (readyClient) => {
                console.log(`Ready! Logged in as ${readyClient.user.tag}`);
            });

            // Register client and channel services
            this.containerInstance.register('client', client);
            this.containerInstance.register('channel', new ChannelService(client, logger));
            
            // Register core services in correct order
            this.containerInstance.register('voiceState', new VoiceStateService());
            this.containerInstance.register('storage', new StorageService(baseConfig));
            this.containerInstance.register('audio', new AudioService(
                this.containerInstance.get('voiceState'),
                this.containerInstance.get('storage'),
                logger,
                client,
                this.containerInstance.get('events')
            ));

            // Initialize OpenAI
            this.containerInstance.register('transcription', new TranscriptionService(
                baseConfig, 
                this.containerInstance.get('config')
            ));

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

            // Properly destroy the Discord client
            const client = this.containerInstance.get('client');
            if (client) {
                client.destroy();
            }

            this.containerInstance = null;
            logger.info('[ServiceFactory] Services shut down successfully');
        } catch (error) {
            logger.error('[ServiceFactory] Error during service shutdown:', error);
            throw error;
        }
    }
}