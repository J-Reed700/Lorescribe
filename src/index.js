require('dotenv').config();
const ServiceFactory = require('./services/ServiceFactory');
const CommandRegistry = require('./commands/CommandRegistry');
const logger = require('./utils/logger');
const { ensureDirectoryStructure } = require('./utils/setup');
const baseConfig = require('./config');

class Bot {
    constructor() {
        ensureDirectoryStructure();
        this.initialize();
    }

    async initialize() {
        try {
            const serviceFactory = new ServiceFactory(baseConfig);    
            // Create and initialize container
            this.container = await serviceFactory.initialize();

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

    async sendErrorResponse(interaction) {
        try {
            const response = { 
                content: 'There was an error executing this command!', 
                ephemeral: true 
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