const { jest } = require('@jest/globals');
const path = require('path');
const fs = require('fs');

// Ensure test environment
process.env.NODE_ENV = 'test';

// Create test directories if they don't exist
const testDirs = ['recordings', 'logs'].map(dir => 
    path.join(process.cwd(), 'test', dir)
);

testDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Mock external services
jest.mock('@discordjs/voice', () => ({
    joinVoiceChannel: jest.fn(),
    EndBehaviorType: {
        AfterSilence: 'afterSilence'
    }
}));

jest.mock('openai', () => ({
    OpenAI: jest.fn().mockImplementation(() => ({
        audio: {
            transcriptions: {
                create: jest.fn()
            }
        },
        chat: {
            completions: {
                create: jest.fn()
            }
        }
    }))
}));

// Clean up test files after tests
afterAll(() => {
    testDirs.forEach(dir => {
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true });
        }
    });
}); 