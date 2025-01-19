import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { ensureDirectoryStructure } from '../utils/setup.js';

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