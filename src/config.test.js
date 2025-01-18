module.exports = {
    CHUNK_DURATION: 1000, // 1 second for testing
    MAX_CHUNKS: 2,
    SUMMARY_PROMPT: "Test prompt",
    COMMANDS: {
        START: '!record',
        STOP: '!stop',
        STATUS: '!status',
        HELP: '!help'
    },
    PERMISSIONS: [
        'Connect',
        'Speak',
        'ViewChannel'
    ],
    VOICE: {
        BITRATE: 96000,
        SILENCE_FRAME_LENGTH: 100,
        SAMPLE_RATE: 48000,
        CHANNELS: 2,
        ENCODING: 'opus'
    },
    OUTPUT: {
        DIRECTORY: 'test/recordings',
        FORMAT: 'mp3',
        QUALITY: 2
    }
}; 