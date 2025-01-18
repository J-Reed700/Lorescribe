const { jest } = require('@jest/globals');
const TranscriptionService = require('../services/TranscriptionService');
const config = require('../config.test');

describe('TranscriptionService', () => {
    let transcriptionService;
    let mockOpenAI;

    beforeEach(() => {
        mockOpenAI = {
            audio: {
                transcriptions: {
                    create: jest.fn()
                }
            },
            chat: {
                completions: {
                    create: jest.fn()
                }
            },
            models: {
                list: jest.fn()
            }
        };
        transcriptionService = new TranscriptionService(mockOpenAI, config);
    });

    describe('transcribeAudio', () => {
        it('should transcribe audio successfully', async () => {
            const expectedText = 'test transcription';
            mockOpenAI.audio.transcriptions.create.mockResolvedValue({ text: expectedText });

            const result = await transcriptionService.transcribeAudio('test.mp3');
            expect(result).toBe(expectedText);
        });

        it('should handle transcription errors', async () => {
            mockOpenAI.audio.transcriptions.create.mockRejectedValue(new Error('API Error'));

            await expect(
                transcriptionService.transcribeAudio('test.mp3')
            ).rejects.toThrow('Failed to transcribe audio');
        });
    });

    describe('generateSummary', () => {
        it('should generate summary successfully', async () => {
            const expectedSummary = 'test summary';
            mockOpenAI.chat.completions.create.mockResolvedValue({
                choices: [{ message: { content: expectedSummary } }]
            });

            const result = await transcriptionService.generateSummary('test text');
            expect(result).toBe(expectedSummary);
        });

        it('should handle summary generation errors', async () => {
            mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));

            await expect(
                transcriptionService.generateSummary('test text')
            ).rejects.toThrow('Failed to generate summary');
        });
    });

    describe('_validateOpenAIKey', () => {
        it('should validate valid API key', async () => {
            mockOpenAI.models.list.mockResolvedValue([]);
            const isValid = await transcriptionService._validateOpenAIKey('valid-key');
            expect(isValid).toBe(true);
        });

        it('should reject invalid API key', async () => {
            mockOpenAI.models.list.mockRejectedValue({ response: { status: 401 } });
            const isValid = await transcriptionService._validateOpenAIKey('invalid-key');
            expect(isValid).toBe(false);
        });

        it('should propagate unexpected errors', async () => {
            const error = new Error('Network error');
            mockOpenAI.models.list.mockRejectedValue(error);
            await expect(
                transcriptionService._validateOpenAIKey('test-key')
            ).rejects.toThrow('Network error');
        });
    });
}); 