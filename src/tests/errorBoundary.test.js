import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { handleError } from '../utils/errorBoundary.js';
import logger from '../utils/logger.js';

jest.mock('../utils/logger.js');

describe('Error Boundary', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should log errors properly', () => {
        const error = new Error('Test error');
        handleError(error);

        expect(logger.error).toHaveBeenCalledWith(
            'Uncaught error:',
            expect.objectContaining({
                message: 'Test error',
                stack: expect.any(String)
            })
        );
    });

    it('should handle non-Error objects', () => {
        const nonError = { custom: 'error' };
        handleError(nonError);

        expect(logger.error).toHaveBeenCalledWith(
            'Uncaught error:',
            expect.objectContaining({
                custom: 'error'
            })
        );
    });
}); 