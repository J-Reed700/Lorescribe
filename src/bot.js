require('dotenv').config();
const ServiceFactory = require('./services/ServiceFactory');
const CommandRegistry = require('./commands/CommandRegistry');
const logger = require('./utils/logger');
const { ensureDirectoryStructure } = require('./utils/setup');
const { MessageFlags } = require('discord.js');

class Bot {
    constructor() {
        ensureDirectoryStructure();
        this.initialize();
        this.setupMemoryMonitoring();
    }

    setupMemoryMonitoring() {
        // Log memory usage every 5 minutes
        setInterval(() => {
            const used = process.memoryUsage();
            logger.info('Memory Usage:');
            for (let key in used) {
                logger.info(`${key}: ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
            }
        }, 5 * 60 * 1000);

        // Watch for significant memory increases
        let lastUsage = process.memoryUsage().heapUsed;
        setInterval(() => {
            const currentUsage = process.memoryUsage().heapUsed;
            const diff = currentUsage - lastUsage;
            const diffMB = Math.round(diff / 1024 / 1024 * 100) / 100;
            
            if (diffMB > 50) { // Alert if memory increased by more than 50MB
                logger.warn(`Memory increased by ${diffMB}MB in the last minute`);
                logger.warn('This might indicate a memory leak');
            }
            
            lastUsage = currentUsage;
        }, 60 * 1000);
    }

    async initialize() {
        try {
            // Create and initialize container
            this.container = ServiceFactory.createContainer();

            // Get core services
            this.client = this.container.get('client');
            this.commandRegistry = new CommandRegistry(this.container);

            // Setup event handlers
            this.setupEventHandlers();
            
            logger.info('Bot initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize bot:', error);
            process.exit(1);
        }
    }

    setupEventHandlers() {
        this.client.on('ready', () => {
            logger.info(`Logged in as ${this.client.user.tag}`);
        });

        this.client.on('interactionCreate', this.handleInteraction.bind(this));
        this.client.on('error', this.handleError.bind(this));
    }

    async handleInteraction(interaction) {
        if (!interaction.isCommand()) return;

        try {
            await this.commandRegistry.handleCommand(interaction);
        } catch (error) {
            logger.error('Error handling command:', error);
            await this.sendErrorResponse(interaction);
        }
    }

    async handleError(error) {
        logger.error('Discord client error:', error);
    }

    async sendErrorResponse(interaction) {
        try {
            const response = { 
                content: 'There was an error executing this command!', 
                flags: MessageFlags.Ephemeral
            };

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply(response);
            } else {
                await interaction.editReply(response);
            }
        } catch (error) {
            logger.error('Failed to send error response:', error);
        }
    }

    async start() {
        try {
            await this.client.login(process.env.DISCORD_TOKEN);
        } catch (error) {
            logger.error('Failed to start bot:', error);
            process.exit(1);
        }
    }
}

// Start the bot
const bot = new Bot();
bot.start(); 