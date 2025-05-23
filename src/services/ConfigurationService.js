import Redis from 'ioredis';
import logger from '../utils/logger.js';
import IConfigurationService from '../interfaces/IConfigurationService.js';
import { redisOptions } from '../config/redis.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import config from '../config.js';
export default class ConfigurationService extends IConfigurationService {
    constructor(baseConfig) {
        super();
        this.configs = new Map();
        this.inMemoryKeys = new Map();
        this.config = baseConfig;
        this.baseConfig = config;
        this.redis = new Redis(redisOptions.redis);
        this.loadConfigs();
    }

    async loadConfigs() {
        try {
            // Load guild configs
            const configKeys = await this.redis.keys('guild:*');
            let loadedCount = 0;
            let errorCount = 0;

            for (const key of configKeys) {
                try {
                    const guildId = key.split(':')[1];
                    const configStr = await this.redis.get(key);
                    const config = JSON.parse(configStr);
                    
                    if (this._validateConfig(config)) {
                        this.configs.set(guildId, config);
                        loadedCount++;
                    } else {
                        logger.error(`Invalid config found for guild ${guildId}`);
                        errorCount++;
                    }
                } catch (error) {
                    logger.error(`Error processing config for guild ${key}:`, error);
                    errorCount++;
                }
            }

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

            // Save to Redis
            await this.redis.set(`guild:${guildId}`, JSON.stringify(config));
            
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

    async setOpenAIKey(guildId, key) {
        try {
            // Store the key in memory
            this.inMemoryKeys.set(guildId, key);
            return true;
        } catch (error) {
            logger.error(`Failed to set OpenAI key for guild ${guildId}:`, error);
            throw error;
        }
    }

    getOpenAIKey(guildId) {
        try {
            return this.inMemoryKeys.get(guildId) || null;
        } catch (error) {
            logger.error(`Error getting OpenAI key for guild ${guildId}:`, error);
            return null;
        }
    }

    async clearOpenAIKey(guildId) {
        try {
            // Clear from memory
            this.inMemoryKeys.delete(guildId);

            return true;
        } catch (error) {
            logger.error(`Failed to clear OpenAI key for guild ${guildId}:`, error);
            throw error;
        }
    }

    async deleteGuildConfig(guildId) {
        try {
            await this.redis.del(`guild:${guildId}`);
            this.configs.delete(guildId);
            logger.info(`Deleted configuration for guild ${guildId}`);
            return true;
        } catch (error) {
            logger.error(`Failed to delete config for guild ${guildId}:`, error);
            return false;
        }
    }

    async backupConfigs() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupKey = `backup:${timestamp}`;
            
            const configs = Object.fromEntries(this.configs);
            await this.redis.set(backupKey, JSON.stringify(configs));
            
            // No expiry - backups will persist indefinitely
            logger.info(`Created backup with key ${backupKey}`);
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
            const config = this.getGuildConfig(guildId) || {};
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
            return this.baseConfig.TIME_INTERVAL * 1000 * 60;
        }
    }

    async setSummaryPrompt(guildId, prompt) {
        try {
            const config = this.getGuildConfig(guildId) || {};
            config.summaryPrompt = prompt;
            return await this.setGuildConfig(guildId, config);
        } catch (error) {
            logger.error(`Failed to set summary prompt for guild ${guildId}:`, error);
            throw error;
        }
    }

    async getSummaryPrompt(guildId) {
        try {
            const config = this.getGuildConfig(guildId);
            if (config?.summaryPrompt) {
                return this._setCustomUserPrompt(config.summaryPrompt);
            }
            else {
                return this.baseConfig.SUMMARY_PROMPT;
            }
        } catch (error) {
            logger.error(`Error getting summary prompt for guild ${guildId}:`, error);
            return this.baseConfig.SUMMARY_PROMPT;
        }
    }

    async getSessionSummaryPrompt(guildId) {
        try {
            return this.baseConfig.SESSION_SUMMARY_PROMPT
        } catch (error) {
            logger.error(`Error getting session summary prompt for guild ${guildId}:`, error);
            return this.baseConfig.SESSION_SUMMARY_PROMPT;
        }
    }

    async deleteSummaryPrompt(guildId) {
        try {
            const config = this.getGuildConfig(guildId) || {};
            config.summaryPrompt = null;
            return await this.setGuildConfig(guildId, config);
        } catch (error) {
            logger.error(`Failed to delete summary prompt for guild ${guildId}:`, error);
            throw error;
        }
    }

    _setCustomUserPrompt(summaryPrompt) {
        try {
            let prompt = this.baseConfig.CUSTOM_USER_PROMPT;
            prompt = prompt.replace('&USER_PROMPT&', summaryPrompt);
            return prompt;
        } catch (error) {
            logger.error(`Failed to set custom user prompt:`, error);
            throw error;
        }
    }

    
    async dispose() {
        try {
            await this.redis.quit();
            logger.info('Redis connection closed');
        } catch (error) {
            logger.error('Error closing Redis connection:', error);
        }
    }
}

