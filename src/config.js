export default {
    SIZE_CHECK_INTERVAL: 30 * 1000, // 30 seconds
    TIME_INTERVAL: 4, // 4 minutes
    ROTATION_DELAY: 500, // 500ms delay before processing rotated file
    CHUNK_DURATION: 30 * 1000, // 30 seconds
    MAX_CHUNKS: 48, // 4 hours total maximum
    MAX_FILE_SIZE: 23 * 1024 * 1024, // Reduced to 23MB for faster rotation
    JOB_DELAY: 5000, // 5 seconds delay for debugging
    SYSTEM_RULES: ` #### If there is no transcript return 'No transcript available'. ####
                    
                    #### If you are absolutely positive that you are unable to summarize no matter what and no matter how hard you try, return 'Unable to summarize'. ####`,
    DISCORD_RULES:`#####Format Guidelines:
                    1. Use \`# \` for major sections
                    2. Use \`## \` for subsections
                    3. Use \`### \` for specific categories
                    4. Use \`- \` for bullet points
                    5. Use \`> \` for quotes
                    6. Use \`>>> \` for multi-line quotes
                    7. Use \`***\` for critical moments
                    8. Use \`**\` for emphasis
                    9. Use \`*\` for NPCs/minor emphasis
                    10. Use \`__\` for locations
                    11. Use \`||\` for spoilers
                    12. Use \`\`\` for code blocks/quotes
                    `,
    get CUSTOM_USER_PROMPT() {
        return `${this.SYSTEM_RULES}
                ${this.DISCORD_RULES}
                &USER_PROMPT&`;
    },
    get SUMMARY_PROMPT() {
        return `
                    ${this.SYSTEM_RULES}
                    
                    ##### Rules
                    
                    ##### Narrative Summary
                    Start with a 2-3 sentence high-level overview of the transcript's main events, using ***bold italics*** for particularly significant moments.

                    Then begin a detailed breakdown of the transcript, be very descriptive and detailed. Do not leave out any important details. Below 
                    is a list of different events that could occur in a transcript. Use these as a guide to create a detailed summary of the transcript where 
                    applicable. For example, if there was a combat encounter, you would include a detailed breakdown of the encounter. If there was a 
                    significant NPC, you would include a detailed breakdown of the NPC. If there was a new location, you would include a detailed breakdown 
                    of the location. Don't miss out on any of the important dialogue.

                    Otherwise, just give a very detailed summary of the transcript.
                    
                    If any of the below sections are not applicable, omit them. Do not include them in the summary.

                    ##### Detailed Breakdown

                    ### Combat Encounters
                    For each major battle:
                    - **Enemies Faced**: 
                    - **Notable Tactics**:
                    - **Key Moments**:
                    - **Outcome**:

                    ### Character Development
                    For each PC:
                    - ***Notable Decisions***
                    - **Character Growth**
                    - *Relationships/Interactions*
                    - Key Roleplay Moments

                    ### World Building
                    - __New Locations__
                    - *New NPCs*
                    - **Factions/Organizations**
                    - Plot Developments

                    ### Memorable Moments
                    - \`\`\`Highlight particularly funny, dramatic, or significant quotes\`\`\`
                    - **Critical Successes/Failures**
                    - *Unexpected Events*
                    - Player Innovations

                    ${this.DISCORD_RULES}

                    #####Remember to:
                    - Maintain chronological flow while grouping related events
                    - Attribute actions and quotes to specific players/characters
                    - Highlight both mechanical and narrative developments
                    - Note any unresolved plot threads or mysteries
                    - Include both in-character and out-of-character significant moments
                    - Document any major rule interpretations or house rules applied
                    - Balance detail with readability
                    - Use appropriate formatting for emphasis and organization
                    `;
    },
    TRANSCRIPTION_PROMPT: `Please transcribe the audio, clearly indicating different speakers by prefixing their lines with their usernames. 
                    
                    For example, if the user is called "John", and they say "Hello, how are you?", you would transcribe it as "John: Hello, how are you?".            

                    If there is no audio, return "No audio available".

                    If you cannot infer who is speaking, just use user1, user2, and so on.
                    for example, if two people are talking, you would transcribe it as "user1: Hello, how are you? user2: I'm fine, thank you."
                    `,
    COMMANDS: {
        START: '!record',
        STOP: '!stop',
        STATUS: '!status',
        HELP: '!help',
        SETCHANNEL: '!setsummarychannel',
        SETTIMEINTERVAL: '!settimeinterval',
        MODIFY_PROMPT: '!modifyprompt'
    },
    PERMISSIONS: [
        'Connect',
        'Speak',
        'ViewChannel',
        'SendMessages'
    ],
    VOICE: {
        BITRATE: 24000,  // Reduced for better multi-speaker handling
        SILENCE_FRAME_LENGTH: 10000,
        SAMPLE_RATE: 24000,  // Using standard Opus rate
        CHANNELS: 2,     // Keeping stereo for better quality
        ENCODING: 'opus'
    },
    STORAGE: {
        TEMP_DIRECTORY: 'temp',           // For temporary audio files
        TRANSCRIPTS_DIRECTORY: 'data/transcripts', // For storing transcripts
        SUMMARIES_DIRECTORY: 'data/summaries',  // For storing summaries
        RETENTION_DAYS: 1,               // How long to keep transcripts and summaries
        CLEANUP_INTERVAL: 24 * 60 * 60 * 1000, // Cleanup old files daily
    },
    OUTPUT: {
        DIRECTORY: 'recordings',  // Deprecated, use STORAGE paths instead
        FORMAT: 'mp3',
        QUALITY: 4,  // Higher quality VBR (0-9, lower is better)
        BITRATE: '128k'  // Increased bitrate for better quality
    }
};