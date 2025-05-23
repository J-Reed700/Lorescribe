import fs from 'node:fs';
import path from 'node:path';
import logger from '../utils/logger.js';


export default class StorageService {
    constructor(config) {
        this.config = config;
        this.guildData = new Map();
        this.ensureDirectories();
        this.startCleanupInterval();
    }

    ensureDirectories() {
        const dirs = [
            this.config.STORAGE.TEMP_DIRECTORY,
            this.config.STORAGE.TRANSCRIPTS_DIRECTORY,
            this.config.STORAGE.SUMMARIES_DIRECTORY
        ];

        dirs.forEach(dir => {
            const fullPath = path.join(process.cwd(), dir);
            if (!fs.existsSync(fullPath)) {
                try {
                    fs.mkdirSync(fullPath, { recursive: true });
                    logger.info(`[StorageService] Created directory: ${dir}`);
                } catch (error) {
                    logger.error('[StorageService] Failed to create directory:', {
                        location: 'StorageService.ensureDirectories',
                        error: {
                            name: error.name,
                            message: error.message,
                            code: error.code,
                            stack: error.stack
                        },
                        context: {
                            directory: dir,
                            fullPath,
                            exists: fs.existsSync(fullPath)
                        }
                    });
                }
            }
        });
    }

    startCleanupInterval() {
        setInterval(() => this.cleanup(), this.config.STORAGE.CLEANUP_INTERVAL);
        this.cleanup(); // Run initial cleanup
    }

    async cleanup() {
        const now = Date.now();
        const maxAge = this.config.STORAGE.RETENTION_DAYS * 24 * 60 * 60 * 1000;

        try {
            // Cleanup temp directory (delete all files)
            await this.cleanDirectory(this.config.STORAGE.TEMP_DIRECTORY, maxAge);
            
            // Cleanup transcripts and summaries older than retention period
            await this.cleanDirectory(this.config.STORAGE.TRANSCRIPTS_DIRECTORY, maxAge);
            await this.cleanDirectory(this.config.STORAGE.SUMMARIES_DIRECTORY, maxAge);

            logger.info('[StorageService] Storage cleanup completed');
        } catch (error) {
            logger.error('[StorageService] Error during storage cleanup:', {
                location: 'StorageService.cleanup',
                error: {
                    name: error.name,
                    message: error.message,
                    code: error.code,
                    stack: error.stack
                },
                context: {
                    maxAge,
                    retentionDays: this.config.STORAGE.RETENTION_DAYS
                }
            });
        }
    }

    async cleanDirectory(dir, maxAge) {
        const fullPath = path.join(process.cwd(), dir);
        const now = Date.now();

        try {
            const files = await fs.promises.readdir(fullPath);
            logger.info(`[StorageService] Cleaning directory:`, {
                directory: dir,
                fileCount: files.length,
                maxAge
            });

            for (const file of files) {
                try {
                    const filePath = path.join(fullPath, file);
                    const stats = await fs.promises.stat(filePath);
                    
                    if (now - stats.mtimeMs > maxAge) {
                        await fs.promises.unlink(filePath);
                        logger.info(`[StorageService] Deleted old file:`, {
                            file,
                            age: now - stats.mtimeMs,
                            size: stats.size
                        });
                    }
                } catch (error) {
                    logger.error(`[StorageService] Error cleaning up file:`, {
                        location: 'StorageService.cleanDirectory',
                        error: {
                            name: error.name,
                            message: error.message,
                            code: error.code,
                            stack: error.stack
                        },
                        context: {
                            file,
                            directory: dir,
                            maxAge
                        }
                    });
                }
            }
        } catch (error) {
            logger.error('[StorageService] Error reading directory:', {
                location: 'StorageService.cleanDirectory',
                error: {
                    name: error.name,
                    message: error.message,
                    code: error.code,
                    stack: error.stack
                },
                context: {
                    directory: dir,
                    fullPath,
                    exists: fs.existsSync(fullPath)
                }
            });
        }
    }

    getTempFilePath(guildId, type = 'pcm') {
        logger.info(`[StorageService] Generating temp file path for guild ${guildId} with type ${type}`);
        const randomId = Math.random().toString(36).substring(2, 15);
        const filename = `recording-${guildId}-${Date.now()}-${randomId}.${type}`;
        const filepath = path.join(
            process.cwd(),
            this.config.STORAGE.TEMP_DIRECTORY,
            filename
        );
        logger.info(`[StorageService] Generated temp file path:`, {
            guildId,
            type,
            filename,
            directory: this.config.STORAGE.TEMP_DIRECTORY
        });
        return filepath;
    }

    async saveTranscript(guildId, transcript, timestamp) {
        const guildDir = path.join(
            process.cwd(),
            this.config.STORAGE.TRANSCRIPTS_DIRECTORY,
            guildId.toString()
        );
        
        // Ensure guild directory exists
        if (!fs.existsSync(guildDir)) {
            await fs.promises.mkdir(guildDir, { recursive: true });
            logger.info(`[StorageService] Created guild directory:`, {
                guildId,
                directory: guildDir
            });
        }

        const fileName = `transcript-${guildId}-${timestamp}.txt`;
        const filePath = path.join(guildDir, fileName);

        try {
            await fs.promises.writeFile(filePath, transcript);
            logger.info(`[StorageService] Saved transcript:`, {
                guildId,
                fileName,
                size: transcript.length
            });
            return fileName;
        } catch (error) {
            logger.error('[StorageService] Failed to save transcript:', {
                location: 'StorageService.saveTranscript',
                error: {
                    name: error.name,
                    message: error.message,
                    code: error.code,
                    stack: error.stack
                },
                context: {
                    guildId,
                    fileName,
                    filePath,
                    transcriptLength: transcript?.length
                }
            });
            throw error;
        }
    }

    async saveSummary(guildId, summary, timestamp) {
        const guildDir = path.join(
            process.cwd(),
            this.config.STORAGE.SUMMARIES_DIRECTORY,
            guildId.toString()
        );
        
        // Ensure guild directory exists
        if (!fs.existsSync(guildDir)) {
            await fs.promises.mkdir(guildDir, { recursive: true });
            logger.info(`[StorageService] Created guild directory:`, {
                guildId,
                directory: guildDir
            });
        }

        const fileName = `summary-${guildId}-${timestamp}.txt`;
        const filePath = path.join(guildDir, fileName);

        try {
            await fs.promises.writeFile(filePath, summary);
            logger.info(`[StorageService] Saved summary:`, {
                guildId,
                fileName,
                size: summary.length
            });
            return fileName;
        } catch (error) {
            logger.error('[StorageService] Failed to save summary:', {
                location: 'StorageService.saveSummary',
                error: {
                    name: error.name,
                    message: error.message,
                    code: error.code,
                    stack: error.stack
                },
                context: {
                    guildId,
                    fileName,
                    filePath,
                    summaryLength: summary?.length
                }
            });
            throw error;
        }
    }

    async deleteFile(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
                logger.info(`[StorageService] Deleted file:`, {
                    file: path.basename(filePath),
                    directory: path.dirname(filePath)
                });
                return true;
            }
            return false;
        } catch (error) {
            logger.error('[StorageService] Failed to delete file:', {
                location: 'StorageService.deleteFile',
                error: {
                    name: error.name,
                    message: error.message,
                    code: error.code,
                    stack: error.stack
                },
                context: {
                    filePath,
                    exists: fs.existsSync(filePath)
                }
            });
            return false;
        }
    }

    async getRecentSummaries(guildId, limit = 10) {
        try {
            const guildDir = path.join(process.cwd(), this.config.STORAGE.SUMMARIES_DIRECTORY, guildId.toString());
            if (!fs.existsSync(guildDir)) {
                logger.info(`[StorageService] No summaries directory exists for guild ${guildId}`);
                return [];
            }

            const files = await fs.promises.readdir(guildDir);
            
            const guildSummaries = files
                .filter(f => f.startsWith(`summary-${guildId}-`))
                .sort()
                .reverse()
                .slice(0, limit);

            logger.info(`[StorageService] Fetching recent summaries:`, {
                guildId,
                limit,
                found: guildSummaries.length
            });

            const summaries = [];
            for (const file of guildSummaries) {
                try {
                    const content = await fs.promises.readFile(path.join(guildDir, file), 'utf8');
                    summaries.push({
                        timestamp: file.split('-')[2].replace('.txt', ''),
                        content
                    });
                } catch (error) {
                    logger.error('[StorageService] Error reading summary file:', {
                        location: 'StorageService.getRecentSummaries',
                        error: {
                            name: error.name,
                            message: error.message,
                            code: error.code,
                            stack: error.stack
                        },
                        context: {
                            guildId,
                            file,
                            directory: guildDir
                        }
                    });
                }
            }

            return summaries;
        } catch (error) {
            logger.error('[StorageService] Failed to get recent summaries:', {
                location: 'StorageService.getRecentSummaries',
                error: {
                    name: error.name,
                    message: error.message,
                    code: error.code,
                    stack: error.stack
                },
                context: {
                    guildId,
                    limit,
                    directory: this.config.STORAGE.SUMMARIES_DIRECTORY
                }
            });
            throw error;
        }
    }

    async getSummariesInRange(guildId, startTime, endTime) {
        const guildDir = path.join(process.cwd(), this.config.STORAGE.SUMMARIES_DIRECTORY, guildId.toString());
        if (!fs.existsSync(guildDir)) {
            logger.info(`[StorageService] No summaries directory exists for guild ${guildId}`);
            return [];
        }

        const files = await fs.promises.readdir(guildDir);
        
        const summaries = [];
        for (const file of files) {
            if (!file.startsWith(`summary-${guildId}-`)) continue;
            
            const timestamp = parseInt(file.split('-')[2].replace('.txt', ''));
            if (timestamp >= startTime && timestamp <= endTime) {
                const content = await fs.promises.readFile(path.join(guildDir, file), 'utf8');
                summaries.push({
                    timestamp,
                    content,
                    filename: file
                });
            }
        }
        
        return summaries.sort((a, b) => a.timestamp - b.timestamp);
    }

    async getTranscriptsInRange(guildId, startTime, endTime) {
        const guildDir = path.join(process.cwd(), this.config.STORAGE.TRANSCRIPTS_DIRECTORY, guildId.toString());
        if (!fs.existsSync(guildDir)) {
            logger.info(`[StorageService] No transcripts directory exists for guild ${guildId}`);
            return [];
        }

        const files = await fs.promises.readdir(guildDir);
        
        const transcripts = [];
        for (const file of files) {
            if (!file.startsWith(`transcript-${guildId}-`)) continue;
            
            const timestamp = parseInt(file.split('-')[2].replace('.txt', ''));
            if (timestamp >= startTime && timestamp <= endTime) {
                const content = await fs.promises.readFile(path.join(guildDir, file), 'utf8');
                transcripts.push({
                    timestamp,
                    content,
                    filename: file
                });
            }
        }
        
        return transcripts.sort((a, b) => a.timestamp - b.timestamp);
    }

    async exportSessionData(history) {
        const exportDir = path.join(process.cwd(), 'exports');
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const exportPath = path.join(
            exportDir, 
            `session-${history.guildId}-${timestamp}.json`
        );

        const exportData = {
            ...history,
            exportedAt: Date.now(),
            summaries: history.summaries.map(s => ({
                ...s,
                time: new Date(s.timestamp).toLocaleString()
            })),
            transcripts: history.transcripts.map(t => ({
                ...t,
                time: new Date(t.timestamp).toLocaleString()
            }))
        };

        await fs.promises.writeFile(
            exportPath,
            JSON.stringify(exportData, null, 2)
        );

        return exportPath;
    }

    async getExports(guildId) {
        const exportDir = path.join(process.cwd(), 'exports');
        if (!fs.existsSync(exportDir)) return [];

        const files = await fs.promises.readdir(exportDir);
        return files
            .filter(f => f.startsWith(`session-${guildId}-`))
            .map(f => ({
                filename: f,
                path: path.join(exportDir, f)
            }));
    }

    async getFullPath(fileName) {
        return path.join(process.cwd(), this.config.STORAGE.SUMMARIES_DIRECTORY, fileName);
    }
}

