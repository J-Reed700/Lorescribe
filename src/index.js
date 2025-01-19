import Bot from './bot.js';
import logger from './utils/logger.js';

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    process.exit(1);
});

// Start the bot
const bot = new Bot();
await bot.initialize(); 