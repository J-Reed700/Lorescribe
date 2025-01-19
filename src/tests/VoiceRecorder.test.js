import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import VoiceRecorder from '../VoiceRecorder.js';
import Container from '../services/Container.js';
import config from '../config.test.js';

describe('VoiceRecorder', () => {
    let voiceRecorder;
    let mockServices;

    beforeEach(() => {
        // Create mock services
        mockServices = {
            audio: {
                createVoiceConnection: jest.fn().mockResolvedValue({
                    receiver: {
                        subscribe: jest.fn().mockReturnValue({
                            on: jest.fn(),
                            pipe: jest.fn()
                        })
                    },
                    destroy: jest.fn()
                }),
                convertToMp3: jest.fn().mockResolvedValue('test.mp3')
            },
            transcription: {
                transcribeAudio: jest.fn().mockResolvedValue('test transcript'),
                generateSummary: jest.fn().mockResolvedValue('test summary')
            },
            voiceState: {
                on: jest.fn(),
                emit: jest.fn()
            },
            logger: {
                info: jest.fn(),
                error: jest.fn(),
                debug: jest.fn()
            },
            events: {
                emit: jest.fn(),
                on: jest.fn()
            },
            config: config
        };

        // Set up container with mock services
        const container = new Container();
        Object.entries(mockServices).forEach(([name, service]) => {
            container.register(name, service);
        });

        voiceRecorder = new VoiceRecorder(container);
    });

    describe('startRecording', () => {
        it('should start recording successfully', async () => {
            const mockVoiceChannel = {
                id: '123',
                guild: { id: '456' }
            };

            await voiceRecorder.startRecording(mockVoiceChannel);

            expect(mockServices.audio.createVoiceConnection).toHaveBeenCalledWith(mockVoiceChannel);
            expect(mockServices.events.emit).toHaveBeenCalledWith('recordingStarted', expect.any(Object));
        });

        it('should throw error if session already exists', async () => {
            const mockVoiceChannel = {
                id: '123',
                guild: { id: '456' }
            };

            await voiceRecorder.startRecording(mockVoiceChannel);
            await expect(
                voiceRecorder.startRecording(mockVoiceChannel)
            ).rejects.toThrow('Recording already in progress');
        });

        it('should handle connection failure', async () => {
            const mockVoiceChannel = {
                id: '123',
                guild: { id: '456' }
            };

            mockServices.audio.createVoiceConnection.mockRejectedValue(new Error('Connection failed'));

            await expect(
                voiceRecorder.startRecording(mockVoiceChannel)
            ).rejects.toThrow('Connection failed');
        });
    });

    describe('stopRecording', () => {
        it('should stop recording and generate summary', async () => {
            const guildId = '456';
            const mockVoiceChannel = {
                id: '123',
                guild: { id: guildId }
            };

            await voiceRecorder.startRecording(mockVoiceChannel);
            const summary = await voiceRecorder.stopRecording(guildId);

            expect(summary).toBe('test summary');
            expect(mockServices.events.emit).toHaveBeenCalledWith('recordingStarted', expect.any(Object));
        });

        it('should return null if no session exists', async () => {
            const summary = await voiceRecorder.stopRecording('nonexistent');
            expect(summary).toBeNull();
        });
    });

    describe('getStatus', () => {
        it('should return correct status for active recording', async () => {
            const guildId = '456';
            const mockVoiceChannel = {
                id: '123',
                guild: { id: guildId }
            };

            await voiceRecorder.startRecording(mockVoiceChannel);
            const status = voiceRecorder.getStatus(guildId);

            expect(status).toMatchObject({
                chunks: 0,
                currentChunkSize: 0,
                duration: expect.any(Number)
            });
        });

        it('should return null for inactive recording', () => {
            const status = voiceRecorder.getStatus('nonexistent');
            expect(status).toBeNull();
        });
    });

    describe('event handling', () => {
        it('should handle voice state disconnection', () => {
            const guildId = '456';
            const mockVoiceChannel = {
                id: '123',
                guild: { id: guildId }
            };

            voiceRecorder.startRecording(mockVoiceChannel);
            
            // Simulate voice state disconnection
            const disconnectCallback = mockServices.voiceState.on.mock.calls.find(
                call => call[0] === 'disconnected'
            )[1];

            disconnectCallback(guildId);

            expect(mockServices.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Recording stopped due to disconnection')
            );
        });

        it('should handle chunk rotation', async () => {
            jest.useFakeTimers();
            
            const guildId = '456';
            const mockVoiceChannel = {
                id: '123',
                guild: { id: guildId }
            };

            await voiceRecorder.startRecording(mockVoiceChannel);
            
            jest.advanceTimersByTime(config.CHUNK_DURATION);

            expect(mockServices.events.emit).toHaveBeenCalledWith(
                'chunkStarted',
                expect.any(Object)
            );

            jest.useRealTimers();
        });

        it('should stop recording when max chunks reached', async () => {
            jest.useFakeTimers();
            
            const guildId = '456';
            const mockVoiceChannel = {
                id: '123',
                guild: { id: guildId }
            };

            await voiceRecorder.startRecording(mockVoiceChannel);
            
            // Simulate reaching max chunks
            for (let i = 0; i < config.MAX_CHUNKS; i++) {
                jest.advanceTimersByTime(config.CHUNK_DURATION);
            }

            expect(mockServices.events.emit).toHaveBeenCalledWith(
                'maxChunksReached',
                expect.any(Object)
            );

            jest.useRealTimers();
        });
    });

    describe('error handling', () => {
        it('should handle transcription errors', async () => {
            const guildId = '456';
            const mockVoiceChannel = {
                id: '123',
                guild: { id: guildId }
            };

            mockServices.transcription.transcribeAudio.mockRejectedValue(
                new Error('Transcription failed')
            );

            await voiceRecorder.startRecording(mockVoiceChannel);
            await voiceRecorder.stopRecording(guildId);

            expect(mockServices.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error processing chunk'),
                expect.any(Error)
            );
        });

        it('should handle audio conversion errors', async () => {
            const guildId = '456';
            const mockVoiceChannel = {
                id: '123',
                guild: { id: guildId }
            };

            mockServices.audio.convertToMp3.mockRejectedValue(
                new Error('Conversion failed')
            );

            await voiceRecorder.startRecording(mockVoiceChannel);
            await voiceRecorder.stopRecording(guildId);

            expect(mockServices.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error processing chunk'),
                expect.any(Error)
            );
        });
    });
}); 