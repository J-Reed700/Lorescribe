import fs from 'node:fs';
import path from 'node:path';
import logger from './logger.js';

export async function cleanupOldFiles(directory, maxAge) {
    try {
        const files = await fs.promises.readdir(directory);
        const now = Date.now();
        
        for (const file of files) {
            const filePath = path.join(directory, file);
            const stats = await fs.promises.stat(filePath);
            
            if (now - stats.mtimeMs > maxAge) {
                await fs.promises.unlink(filePath);
                logger.info(`Deleted old file: ${file}`);
            }
        }
    } catch (error) {
        logger.error('Error cleaning up old files:', error);
        throw error;
    }
} 