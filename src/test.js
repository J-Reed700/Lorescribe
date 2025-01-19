import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Test Environment', () => {
    beforeEach(() => {
        // Setup test environment
    });

    afterEach(() => {
        // Cleanup test environment
    });

    it('should have test directories', () => {
        const testDirs = [
            'test/recordings',
            'test/data',
            'test/temp'
        ];

        testDirs.forEach(dir => {
            const fullPath = path.join(__dirname, '..', dir);
            expect(fs.existsSync(fullPath)).toBe(true);
        });
    });
}); 