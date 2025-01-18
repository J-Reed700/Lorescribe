const { jest } = require('@jest/globals');
const ServiceFactory = require('../services/ServiceFactory');

jest.mock('../services/Container', () => {
    return {
        register: jest.fn(),
        registerImplementation: jest.fn()
    };
});

describe('ServiceFactory', () => {
    it('should create and register all required services', () => {
        const mockOpenAI = {};
        const container = ServiceFactory.createServices(mockOpenAI);

        expect(container.register).toHaveBeenCalledWith('config', expect.any(Object));
        expect(container.register).toHaveBeenCalledWith('logger', expect.any(Object));
        expect(container.register).toHaveBeenCalledWith('events', expect.any(Object));
        expect(container.register).toHaveBeenCalledWith('openai', mockOpenAI);
        expect(container.register).toHaveBeenCalledWith('audio', expect.any(Object));
        expect(container.register).toHaveBeenCalledWith('transcription', expect.any(Object));
        expect(container.register).toHaveBeenCalledWith('voiceState', expect.any(Object));
        expect(container.register).toHaveBeenCalledWith('voiceRecorder', expect.any(Object));
        expect(container.register).toHaveBeenCalledWith('guildConfig', expect.any(Object));
    });
}); 