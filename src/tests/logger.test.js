const { jest } = require('@jest/globals');
const winston = require('winston');

jest.mock('winston', () => ({
    format: {
        timestamp: jest.fn().mockReturnValue('timestamp'),
        json: jest.fn().mockReturnValue('json'),
        combine: jest.fn().mockReturnValue('combined'),
        simple: jest.fn().mockReturnValue('simple')
    },
    createLogger: jest.fn().mockReturnValue({
        add: jest.fn()
    }),
    transports: {
        File: jest.fn(),
        Console: jest.fn()
    }
}));

describe('logger', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should create logger with correct configuration', () => {
        require('../utils/logger');

        expect(winston.createLogger).toHaveBeenCalledWith({
            level: 'info',
            format: 'combined',
            transports: expect.any(Array)
        });
    });

    it('should add console transport in non-production', () => {
        process.env.NODE_ENV = 'development';
        const logger = require('../utils/logger');

        expect(winston.transports.Console).toHaveBeenCalled();
        expect(logger.add).toHaveBeenCalled();
    });
}); 