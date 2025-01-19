export default {
    TIME_INTERVAL: 2, // 2 minutes
    CHUNK_DURATION: 30 * 1000, // 10 seconds for debugging
    MAX_CHUNKS: 48, // 4 hours total maximum
    SUMMARY_PROMPT: "You are a helpful assistant that summarizes D&D sessions in Discord, you are about to be given a transcript of a D&D session, summarize the transcript in a clear, readable way with proper paragraphs and speaker attribution. Include any key decisions, actions, or memorable moments. Use Discord markdown formatting for emphasis where appropriate. If there is no transcript or you are unable to summarize, return 'No transcript available'.",
    TRANSCRIPTION_PROMPT: "Please transcribe the audio, clearly indicating different speakers by prefixing their lines with their usernames.",
    COMMANDS: {
        START: '!record',
        STOP: '!stop',
        STATUS: '!status',
        HELP: '!help',
        SETCHANNEL: '!setsummarychannel',
        SETTIMEINTERVAL: '!settimeinterval'
    },
    PERMISSIONS: [
        'Connect',
        'Speak',
        'ViewChannel',
        'SendMessages'
    ],
    VOICE: {
        BITRATE: 96000,
        SILENCE_FRAME_LENGTH: 10000,
        SAMPLE_RATE: 48000,
        CHANNELS: 2,
        ENCODING: 'opus'
    },
    STORAGE: {
        TEMP_DIRECTORY: 'temp',           // For temporary audio files
        TRANSCRIPTS_DIRECTORY: 'transcripts', // For storing transcripts
        SUMMARIES_DIRECTORY: 'summaries',  // For storing summaries
        RETENTION_DAYS: 30,               // How long to keep transcripts and summaries
        CLEANUP_INTERVAL: 24 * 60 * 60 * 1000, // Cleanup old files daily
    },
    OUTPUT: {
        DIRECTORY: 'recordings',  // Deprecated, use STORAGE paths instead
        FORMAT: 'mp3',
        QUALITY: 2
    }
};