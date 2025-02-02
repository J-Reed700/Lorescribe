export default {
    TIME_INTERVAL: 5, // 5 minutes
    ROTATION_DELAY: 500, // 500ms delay before processing rotated file
    CHUNK_DURATION: 30 * 1000, // 30 seconds
    MAX_CHUNKS: 48, // 4 hours total maximum
    JOB_DELAY: 5000, // 5 seconds delay for debugging
    ORGANIZE_PROMPT: `You are given a transcript of a voice chat. Please organize the transcript into a structured format. Organize and assign a name to each speaker. If there is no way to defer the speaker, just use user1, user2, and so on.`,
    SUMMARY_PROMPT: `

                    ##### Rules
                    
                    ##### Narrative Summary
                    Start with a 2-3 sentence high-level overview of the transcript's main events, using ***bold italics*** for particularly significant moments.

                    Then begin a detailed breakdown of the transcript, be very descriptive and detailed. Do not leave out any important details. Below 
                    is a list of different events that could occur in a transcript. Use these as a guide to create a detailed summary of the transcript where 
                    applicable. For example, if there was a combat encounter, you would include a detailed breakdown of the encounter. If there was a 
                    significant NPC, you would include a detailed breakdown of the NPC. If there was a new location, you would include a detailed breakdown 
                    of the location.

                    Otherwise, just give a very detailed summary of the transcript.


                    ##### Detailed Breakdown
                    
                    ##### Key Events
                    Chronologically list major events, using:
                    - \`>\` for important quotes
                    - \`**\` for combat encounters
                    - \`*\` for significant NPCs
                    - \`__\` for new locations
                    - ||Spoiler tags|| for reveals/twists

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

                    ### Consequences & Setup
                    - **Immediate Consequences**
                    - *Future Plot Hooks*
                    - Unresolved Threads
                    - Party's Next Objectives

                    ## Technical Notes
                    - **House Rules Applied**
                    - *Mechanical Challenges*
                    - Rule Interpretations

                    ## Next Session
                    - ***Immediate Goals***
                    - *Known Challenges Ahead*
                    - Player Intentions

                    #####Format Guidelines:
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

                    #####Remember to:
                    - Maintain chronological flow while grouping related events
                    - Attribute actions and quotes to specific players/characters
                    - Highlight both mechanical and narrative developments
                    - Note any unresolved plot threads or mysteries
                    - Include both in-character and out-of-character significant moments
                    - Document any major rule interpretations or house rules applied
                    - Balance detail with readability
                    - Use appropriate formatting for emphasis and organization
                    
                    #### If there is no transcript return 'No transcript available'. ####
                    
                    #### If you are absolutely positive that you are unable to summarize no matter what and no matter how hard you try, return 'Unable to summarize'. ####`  ,

    TRANSCRIPTION_PROMPT: `Please transcribe the audio, clearly indicating different speakers by prefixing their lines with their usernames. 
                    
                    For example, if the user is called "John", and they say "Hello, how are you?", you would transcribe it as "John: Hello, how are you?".
                    
                    If you cannot infer who is speaking, just use user1, user2, and so on.
                    for example, if two people are talking, you would transcribe it as "user1: Hello, how are you? user2: I'm fine, thank you."
                    If there is no audio, return "No audio available".`,
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
        TRANSCRIPTS_DIRECTORY: 'data/transcripts', // For storing transcripts
        SUMMARIES_DIRECTORY: 'data/summaries',  // For storing summaries
        RETENTION_DAYS: 30,               // How long to keep transcripts and summaries
        CLEANUP_INTERVAL: 24 * 60 * 60 * 1000, // Cleanup old files daily
    },
    OUTPUT: {
        DIRECTORY: 'recordings',  // Deprecated, use STORAGE paths instead
        FORMAT: 'mp3',
        QUALITY: 2
    }
};