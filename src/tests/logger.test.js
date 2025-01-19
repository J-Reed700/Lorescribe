import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import winston from 'winston';

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

    it('should create logger with correct configuration', async () => {
        const { default: logger } = await import('../utils/logger.js');

        expect(winston.createLogger).toHaveBeenCalledWith({
            level: 'info',
            format: 'combined',
            transports: expect.any(Array)
        });
    });

    it('should add console transport in non-production', async () => {
        process.env.NODE_ENV = 'development';
        const { default: logger } = await import('../utils/logger.js');

        expect(winston.transports.Console).toHaveBeenCalled();
        expect(logger.add).toHaveBeenCalled();
    });
}); 