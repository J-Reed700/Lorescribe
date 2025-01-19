import { describe, it, expect } from '@jest/globals';
import config from './config.js';

describe('Config', () => {
    it('should have audio settings', () => {
        expect(config.audio).toBeDefined();
        expect(config.audio.recordingDir).toBeDefined();
        expect(config.audio.maxDuration).toBeDefined();
        expect(config.audio.bitrate).toBeDefined();
        expect(config.audio.channels).toBeDefined();
    });

    it('should have storage settings', () => {
        expect(config.storage).toBeDefined();
        expect(config.storage.baseDir).toBeDefined();
        expect(config.storage.maxFileSize).toBeDefined();
    });
}); 