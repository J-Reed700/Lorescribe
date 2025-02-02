import fs from 'node:fs';
import path from 'node:path';
import logger from '../utils/logger.js';
import IConfigurationService from '../interfaces/IConfigurationService.js';
import baseConfig from '../config.js';

export default class ConfigurationService extends IConfigurationService {
    constructor(baseConfig) {
        super();
        this.configPath = path.join(process.cwd(), 'guild-configs');
        this.configs = new Map();
        this.inMemoryKeys = new Map();
        this.baseConfig = baseConfig;
        this.ensureConfigDirectory();
        this.loadConfigs();
    }

    ensureConfigDirectory() {
        try {
            if (!fs.existsSync(this.configPath)) {
                fs.mkdirSync(this.configPath, { recursive: true });
                logger.info('Created guild configs directory');
            }
        } catch (error) {
            logger.error('Failed to create guild configs directory:', error);
            throw new Error('Failed to initialize configuration service');
        }
    }

    loadConfigs() {
        try {
            const files = fs.readdirSync(this.configPath);
            let loadedCount = 0;
            let errorCount = 0;

            files.forEach(file => {
                if (file.endsWith('.json')) {
                    try {
                        const guildId = file.replace('.json', '');
                        const filePath = path.join(this.configPath, file);
                        const fileContent = fs.readFileSync(filePath, 'utf8');
                        
                        try {
                            const config = JSON.parse(fileContent);
                            if (this._validateConfig(config)) {
                                this.configs.set(guildId, config);
                                loadedCount++;
                            } else {
                                logger.error(`Invalid config found for guild ${guildId}`);
                                errorCount++;
                            }
                        } catch (parseError) {
                            logger.error(`Failed to parse config for guild ${guildId}:`, parseError);
                            errorCount++;
                            // Move invalid file to .invalid extension
                            fs.renameSync(filePath, `${filePath}.invalid`);
                        }
                    } catch (fileError) {
                        logger.error(`Error processing config file ${file}:`, fileError);
                        errorCount++;
                    }
                }
            });

            logger.info(`Loaded ${loadedCount} guild configs, ${errorCount} errors`);
        } catch (error) {
            logger.error('Error loading guild configs:', error);
            throw new Error('Failed to load configurations');
        }
    }

    getGuildConfig(guildId) {
        try {
            return this.configs.get(guildId) || null;
        } catch (error) {
            logger.error(`Error retrieving config for guild ${guildId}:`, error);
            return null;
        }
    }

    async setGuildConfig(guildId, config) {
        if (!guildId || typeof guildId !== 'string') {
            throw new Error('Invalid guild ID');
        }

        try {
            if (!this._validateConfig(config)) {
                throw new Error('Invalid configuration format');
            }

            const filePath = path.join(this.configPath, `${guildId}.json`);
            const tempPath = `${filePath}.tmp`;

            // Write to temporary file first
            await fs.promises.writeFile(
                tempPath,
                JSON.stringify(config, null, 2)
            );

            // Rename temp file to actual file (atomic operation)
            await fs.promises.rename(tempPath, filePath);

            // Update in-memory config
            this.configs.set(guildId, config);

            logger.info(`Updated configuration for guild ${guildId}`);
            return true;
        } catch (error) {
            logger.error(`Failed to save config for guild ${guildId}:`, error);
            throw error;
        }
    }

    _validateConfig(config) {
        if (!config || typeof config !== 'object') {
            logger.error('Config must be an object');
            return false;
        }
        
        if ('summaryChannelId' in config && typeof config.summaryChannelId !== 'string') {
            logger.error('Summary channel ID must be a string');
            return false;
        }

        return true;
    }

    hasOpenAIKey(guildId) {
        try {
            return this.inMemoryKeys.has(guildId);
        } catch (error) {
            logger.error(`Error checking OpenAI key for guild ${guildId}:`, error);
            return false;
        }
    }

    setOpenAIKey(guildId, key) {
        try {
            const config = this.getGuildConfig(guildId) || {};
            config.openAIKey = key;
            this.setGuildConfig(guildId, config);
            return true;
        } catch (error) {
            logger.error(`Failed to set OpenAI key for guild ${guildId}:`, error);
            throw error;
        }
    }

    getOpenAIKey(guildId) {
        try {
            const config = this.getGuildConfig(guildId);
            return config?.openAIKey || null;
        } catch (error) {
            logger.error(`Error getting OpenAI key for guild ${guildId}:`, error);
            return null;
        }
    }

    clearOpenAIKey(guildId) {
        try {
            const config = this.getGuildConfig(guildId);
            if (config) {
                delete config.openAIKey;
                this.setGuildConfig(guildId, config);
            }
        } catch (error) {
            logger.error(`Failed to clear OpenAI key for guild ${guildId}:`, error);
            throw error;
        }
    }

    deleteGuildConfig(guildId) {
        try {
            const filePath = path.join(this.configPath, `${guildId}.json`);
            if (fs.existsSync(filePath)) {
                // Create backup before deletion
                const backupPath = `${filePath}.bak`;
                fs.copyFileSync(filePath, backupPath);
                
                fs.unlinkSync(filePath);
                this.configs.delete(guildId);
                logger.info(`Deleted configuration for guild ${guildId}`);
                return true;
            }
            return false;
        } catch (error) {
            logger.error(`Failed to delete config for guild ${guildId}:`, error);
            return false;
        }
    }

    async backupConfigs() {
        try {
            const backupDir = path.join(this.configPath, 'backups');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(backupDir, `configs-${timestamp}.json`);
            
            const backupData = Object.fromEntries(this.configs);
            await fs.promises.writeFile(backupPath, JSON.stringify(backupData, null, 2));
            
            logger.info(`Created backup at ${backupPath}`);
            return true;
        } catch (error) {
            logger.error('Failed to create backup:', error);
            return false;
        }
    }

    async setSummaryChannel(guildId, channelId) {
        try {
            const config = this.getGuildConfig(guildId) || {};
            config.summaryChannelId = channelId;
            return await this.setGuildConfig(guildId, config);
        } catch (error) {
            logger.error(`Failed to set summary channel for guild ${guildId}:`, error);
            throw error;
        }
    }

    async getSummaryChannel(guildId) {
        try {
            const config = this.getGuildConfig(guildId);
            return config?.summaryChannelId || null;
        } catch (error) {
            logger.error(`Error getting summary channel for guild ${guildId}:`, error);
            return null;
        }
    }

    async setTimeInterval(guildId, interval) {
        try {
            const config = this.getGuildConfig(guildId);
            config.timeInterval = interval;
            return await this.setGuildConfig(guildId, config);
        } catch (error) {
            logger.error(`Failed to set time interval for guild ${guildId}:`, error);
            throw error;
        }
    }

    async getTimeInterval(guildId) {
        try {
            const config = this.getGuildConfig(guildId);
            var timeInterval = config?.timeInterval || this.baseConfig.TIME_INTERVAL;
            timeInterval = timeInterval * 1000 * 60;
            return timeInterval;
        } catch (error) {
            logger.error(`Error getting time interval for guild ${guildId}:`, error);
            return baseConfig.TIME_INTERVAL * 1000 * 60;
        }
    }
}

