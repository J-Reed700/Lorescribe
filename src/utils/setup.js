import fs from 'node:fs';
import path from 'node:path';
import logger from './logger.js';

export function ensureDirectoryStructure() {
    const directories = [
        'recordings',
        'data',
        'data/transcripts',
        'data/summaries',
        'temp'
    ];

    directories.forEach(dir => {
        try {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                logger.info(`Created directory: ${dir}`);
            }
        } catch (error) {
            logger.error(`Failed to create directory ${dir}:`, error);
            throw error;
        }
    });
} 