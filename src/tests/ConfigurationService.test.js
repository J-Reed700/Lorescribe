const { jest } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const ConfigurationService = require('../services/ConfigurationService');

jest.mock('fs');
jest.mock('path');

describe('ConfigurationService', () => {
    let configService;
    const mockConfigPath = '/mock/path/guild-configs';

    beforeEach(() => {
        jest.clearAllMocks();
        path.join.mockImplementation((...args) => args.join('/'));
        process.cwd.mockReturnValue('/mock/path');
        
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockReturnValue(['123.json', '456.json']);
        fs.readFileSync.mockImplementation((path) => {
            const guildId = path.split('/').pop().replace('.json', '');
            return JSON.stringify({ openaiKey: `key-${guildId}` });
        });

        configService = new ConfigurationService();
    });

    describe('constructor', () => {
        it('should create config directory if it doesnt exist', () => {
            fs.existsSync.mockReturnValueOnce(false);
            new ConfigurationService();
            expect(fs.mkdirSync).toHaveBeenCalledWith(mockConfigPath, { recursive: true });
        });

        it('should load existing configs', () => {
            expect(configService.getGuildConfig('123')).toEqual({ openaiKey: 'key-123' });
            expect(configService.getGuildConfig('456')).toEqual({ openaiKey: 'key-456' });
        });
    });

    describe('setGuildConfig', () => {
        it('should save config to file and memory', async () => {
            const guildId = '789';
            const config = { openaiKey: 'new-key' };

            await configService.setGuildConfig(guildId, config);

            expect(fs.promises.writeFile).toHaveBeenCalledWith(
                expect.stringContaining(guildId),
                JSON.stringify(config, null, 2)
            );
            expect(configService.getGuildConfig(guildId)).toEqual(config);
        });

        it('should handle write errors', async () => {
            fs.promises.writeFile.mockRejectedValueOnce(new Error('Write failed'));
            
            const success = await configService.setGuildConfig('789', {});
            expect(success).toBe(false);
        });
    });

    describe('hasOpenAIKey', () => {
        it('should return true when key exists', () => {
            expect(configService.hasOpenAIKey('123')).toBe(true);
        });

        it('should return false when guild has no config', () => {
            expect(configService.hasOpenAIKey('nonexistent')).toBe(false);
        });

        it('should return false when config has no key', () => {
            configService.configs.set('789', {});
            expect(configService.hasOpenAIKey('789')).toBe(false);
        });
    });

    describe('config validation', () => {
        it('should reject invalid API keys', async () => {
            const guildId = '789';
            const invalidConfigs = [
                { openaiKey: 123 },  // not a string
                { openaiKey: 'too-short' },  // too short
                { openaiKey: '' },  // empty string
                null,  // null config
                { randomKey: 'value' }  // missing openaiKey
            ];

            for (const config of invalidConfigs) {
                const success = await configService.setGuildConfig(guildId, config);
                expect(success).toBe(false);
                expect(fs.promises.writeFile).not.toHaveBeenCalled();
            }
        });
    });
}); 