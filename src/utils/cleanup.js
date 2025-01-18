const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const config = require('../config');

class Cleanup {
    constructor() {
        this.cleanupInterval = null;
    }

    start() {
        // Run cleanup every hour
        this.cleanupInterval = setInterval(() => this.cleanup(), 3600000);
        
        // Also clean up on process exit
        process.on('SIGINT', () => {
            this.cleanup();
            process.exit(0);
        });
        
        process.on('SIGTERM', () => {
            this.cleanup();
            process.exit(0);
        });
    }

    cleanup() {
        try {
            const now = Date.now();
            const files = fs.readdirSync(config.OUTPUT.DIRECTORY);
            
            files.forEach(file => {
                const filePath = path.join(config.OUTPUT.DIRECTORY, file);
                const stats = fs.statSync(filePath);
                
                // Delete files older than 24 hours
                if (now - stats.mtimeMs > 24 * 3600 * 1000) {
                    fs.unlinkSync(filePath);
                    logger.debug(`Cleaned up old file: ${file}`);
                }
            });
        } catch (error) {
            logger.error('Error during cleanup:', error);
        }
    }
}

module.exports = new Cleanup(); 