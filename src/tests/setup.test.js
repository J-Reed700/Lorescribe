const { jest } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const { ensureDirectoryStructure } = require('../utils/setup');

jest.mock('fs');
jest.mock('path');

describe('setup', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        path.join.mockImplementation((...args) => args.join('/'));
    });

    it('should create required directories if they dont exist', () => {
        fs.existsSync.mockReturnValue(false);
        
        ensureDirectoryStructure();

        expect(fs.mkdirSync).toHaveBeenCalledWith('recordings', { recursive: true });
        expect(fs.mkdirSync).toHaveBeenCalledWith('logs', { recursive: true });
    });

    it('should not create directories if they already exist', () => {
        fs.existsSync.mockReturnValue(true);
        
        ensureDirectoryStructure();

        expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
}); 