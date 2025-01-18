const { jest } = require('@jest/globals');
const VoiceStateService = require('../services/VoiceStateService');
const config = require('../config.test');

describe('VoiceStateService', () => {
    let voiceStateService;

    beforeEach(() => {
        voiceStateService = new VoiceStateService(config);
    });

    describe('joinChannel', () => {
        it('should join channel successfully', () => {
            const mockVoiceChannel = {
                id: '123',
                guild: { id: '456' }
            };

            const connection = voiceStateService.joinChannel(mockVoiceChannel);
            expect(voiceStateService.isConnected(mockVoiceChannel.guild.id)).toBe(true);
        });

        it('should reuse existing connection', () => {
            const mockVoiceChannel = {
                id: '123',
                guild: { id: '456' }
            };

            const connection1 = voiceStateService.joinChannel(mockVoiceChannel);
            const connection2 = voiceStateService.joinChannel(mockVoiceChannel);

            expect(connection1).toBe(connection2);
        });
    });

    describe('leaveChannel', () => {
        it('should leave channel and cleanup connection', () => {
            const guildId = '456';
            const mockVoiceChannel = {
                id: '123',
                guild: { id: guildId }
            };

            voiceStateService.joinChannel(mockVoiceChannel);
            voiceStateService.leaveChannel(guildId);

            expect(voiceStateService.isConnected(guildId)).toBe(false);
        });
    });
}); 