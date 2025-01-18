const { jest } = require('@jest/globals');
const fs = require('fs');
const { pipeline } = require('node:stream');
const AudioService = require('../services/AudioService');
const config = require('../config.test');

// Mock dependencies
jest.mock('node:stream', () => ({
    pipeline: jest.fn()
}));

jest.mock('fs', () => ({
    createReadStream: jest.fn(),
    createWriteStream: jest.fn()
}));

jest.mock('prism-media', () => ({
    FFmpeg: jest.fn().mockImplementation(() => ({
        pipe: jest.fn()
    }))
}));

describe('AudioService', () => {
    let audioService;
    let mockContainer;

    beforeEach(() => {
        mockContainer = {
            get: jest.fn().mockReturnValue({
                joinChannel: jest.fn().mockReturnValue({
                    on: jest.fn(),
                    destroy: jest.fn()
                })
            })
        };

        global.container = mockContainer;
        audioService = new AudioService(config);
        
        // Reset mocks
        pipeline.mockReset();
        fs.createReadStream.mockReset();
        fs.createWriteStream.mockReset();
    });

    describe('convertToMp3', () => {
        it('should convert PCM to MP3 successfully', async () => {
            const inputFile = 'test.pcm';
            const expectedOutputFile = `test.pcm.${config.OUTPUT.FORMAT}`;

            // Mock successful pipeline
            pipeline.mockImplementation((input, transcoder, output, callback) => {
                callback(null);
            });

            const result = await audioService.convertToMp3(inputFile);
            
            expect(result).toBe(expectedOutputFile);
            expect(pipeline).toHaveBeenCalled();
            expect(fs.createReadStream).toHaveBeenCalledWith(inputFile);
            expect(fs.createWriteStream).toHaveBeenCalledWith(expectedOutputFile);
        });

        it('should handle conversion errors', async () => {
            const inputFile = 'test.pcm';

            // Mock pipeline error
            pipeline.mockImplementation((input, transcoder, output, callback) => {
                callback(new Error('Conversion failed'));
            });

            await expect(
                audioService.convertToMp3(inputFile)
            ).rejects.toThrow('Audio conversion failed');
        });
    });

    describe('createVoiceConnection', () => {
        it('should create voice connection through VoiceStateService', () => {
            const mockVoiceChannel = {
                id: '123',
                guild: { id: '456' }
            };

            const result = audioService.createVoiceConnection(mockVoiceChannel);

            expect(mockContainer.get).toHaveBeenCalledWith('voiceState');
            expect(result).toBeDefined();
        });
    });
}); 