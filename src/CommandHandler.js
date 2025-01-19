import { PermissionsBitField } from 'discord.js';
import config from './config.js';
import logger from './utils/logger.js';
import RecordingEvents from './events/RecordingEvents.js';

export default class CommandHandler {
    constructor(services) {
        this.voiceRecorder = services.get('voiceRecorder');
        this.logger = services.get('logger');
        this.config = services.get('config');
        this.events = services.get('events');
        this.guildConfig = services.get('guildConfig');
        
        this.commands = {
            'record': this.handleStart.bind(this),
            'stop': this.handleStop.bind(this),
            'status': this.handleStatus.bind(this),
            'setsummarychannel': this.handleSetChannel.bind(this),
            'debug': this.handleDebug.bind(this),
            'setkey': this.handleSetKey.bind(this)
        };

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.events.on(RecordingEvents.RECORDING_STARTED, ({ guildId }) => {
            this.logger.info(`Recording started in guild: ${guildId}`);
        });

        this.events.on(RecordingEvents.CONNECTION_ERROR, async ({ guildId, error }) => {
            this.logger.error(`Voice connection error in guild ${guildId}:`, error);
            
            const activeSession = this.voiceRecorder.getStatus(guildId);
            if (activeSession?.interaction) {
                const { interaction } = activeSession;
                try {
                    if (!interaction.deferred && !interaction.replied) {
                        await interaction.reply({
                            content: [
                                '❌ **Voice Connection Error**',
                                'Failed to establish a stable connection to the voice channel.',
                                'Please try again in a few moments.'
                            ].join('\n'),
                            ephemeral: true
                        });
                    }
                } catch (err) {
                    this.logger.error('Failed to send connection error message:', err);
                }
            }
        });
    }

    async handleCommand(interaction) {
        if (!interaction.isCommand()) return;

        await interaction.deferReply({ ephemeral: true });

        try {
            switch (interaction.commandName) {
                case 'record':
                    await this.handleStart(interaction);
                    break;
                case 'stop':
                    await this.handleStop(interaction);
                    break;
                case 'status':
                    await this.handleStatus(interaction);
                    break;
                case 'setsummarychannel':
                    await this.handleSetChannel(interaction);
                    break;
                case 'debug':
                    await this.handleDebug(interaction);
                    break;
                case 'setkey':
                    await this.handleSetKey(interaction);
                    break;
            }
        } catch (error) {
            this.logger.error('Error handling command:', error);
            await interaction.editReply({ 
                content: '❌ An error occurred while processing your command.'
            });
        }
    }

    async handleStart(interaction) {
        if (!interaction.member.voice.channel) {
            try {
                if (interaction.deferred) {
                    await interaction.editReply({ 
                        content: '❌ You need to be in a voice channel to use this command!'
                    });
                } else if (!interaction.replied) {
                    await interaction.reply({ 
                        content: '❌ You need to be in a voice channel to use this command!',
                        ephemeral: true
                    });
                }
            } catch (error) {
                if (error.code !== 10062 && error.code !== 40060) {
                    this.logger.error('Failed to reply to voice channel check:', error);
                }
            }
            return;
        }

        try {
            await this.voiceRecorder.startRecording(interaction.member.voice.channel, interaction);
            
            const successMessage = {
                content: [
                    '🎙️ **Started Recording!**',
                    'The bot will now record and summarize your voice channel conversation.',
                    '',
                    '💡 **Tips:**',
                    '• Speak clearly and at a normal pace',
                    '• Avoid background noise if possible',
                    '• Use `/stop` to end the recording'
                ].join('\n')
            };

            try {
                if (interaction.deferred) {
                    await interaction.editReply(successMessage);
                } else if (!interaction.replied) {
                    await interaction.reply({
                        ...successMessage,
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                if (replyError.code !== 10062 && replyError.code !== 40060) {
                    this.logger.error('Failed to send success message:', replyError);
                }
            }
        } catch (error) {
            this.logger.error('Error starting recording:', error);
            
            const errorMessage = { 
                content: 'Failed to start recording. Please try again.',
                ephemeral: true
            };

            try {
                if (interaction.deferred) {
                    await interaction.editReply(errorMessage);
                } else if (!interaction.replied) {
                    await interaction.reply(errorMessage);
                }
            } catch (replyError) {
                if (replyError.code !== 10062 && replyError.code !== 40060) {
                    this.logger.error('Failed to send error message:', replyError);
                }
            }
        }
    }

    async handleStop(interaction) {
        const status = this.voiceRecorder.getStatus(interaction.guildId);
        if (!status) {
            await interaction.editReply({ 
                content: 'No active recording to stop.'
            });
            return;
        }

        try {
            logger.info('[CommandHandler] Stopping recording...');
            logger.info('[CommandHandler] Guild ID:', interaction.guildId);
            await this.voiceRecorder.stopRecording(interaction.guildId);
            await interaction.editReply({ 
                content: '🛑 Recording stopped! Processing final summary...'
            });
        } catch (error) {
            this.logger.error('Error stopping recording:', error);
            await interaction.editReply({ 
                content: 'Failed to stop recording. Please try again.'
            });
        }
    }

    async handleStatus(interaction) {
        const status = this.voiceRecorder.getStatus(interaction.guildId);
        
        if (!status) {
            await interaction.editReply({ 
                content: 'No active recording session.'
            });
            return;
        }

        try {
            const minutes = Math.floor(status.elapsedMinutes);
            const message = [
                '**Recording Status:**',
                `⏱️ Duration: ${minutes} minutes`,
                `📊 Processed Chunks: ${status.processedChunks}/${status.maxChunks}`,
                `⌛ Time Remaining: ${Math.floor(status.timeRemaining)} minutes`,
                `${status.paused ? '⏸️ Recording is paused' : '▶️ Recording is active'}`
            ].join('\n');

            await interaction.editReply({ content: message });
        } catch (error) {
            this.logger.error('Error getting status:', error);
            await interaction.editReply({ 
                content: 'Failed to get recording status. Please try again.'
            });
        }
    }

    async handleSetChannel(interaction) {
        const channel = interaction.options.getChannel('channel');
        if (!channel || channel.type !== 0) { // 0 is GUILD_TEXT
            await interaction.editReply({ 
                content: 'Please specify a valid text channel!'
            });
            return;
        }

        try {
            await this.guildConfig.setSummaryChannel(interaction.guildId, channel.id);
            await interaction.editReply({ 
                content: `✅ Summary channel set to ${channel.name}!`
            });
        } catch (error) {
            this.logger.error('Error setting summary channel:', error);
            await interaction.editReply({ 
                content: '❌ Failed to set summary channel. Please try again.'
            });
        }
    }

    async handleDebug(interaction) {
        const type = interaction.options.getString('type');
        let debugInfo = 'Debug information not available';

        switch (type) {
            case 'session':
                debugInfo = this.voiceRecorder.getSessionDebugInfo(interaction.guildId);
                break;
            case 'storage':
                debugInfo = this.voiceRecorder.getStorageDebugInfo(interaction.guildId);
                break;
            case 'config':
                debugInfo = this.voiceRecorder.getConfigDebugInfo(interaction.guildId);
                break;
        }

        await interaction.editReply({ content: debugInfo });
    }

    async handleSetKey(interaction) {
        // Check if user has admin permissions
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            await interaction.editReply({
                content: '❌ You need administrator permissions to use this command.',
                ephemeral: true
            });
            return;
        }

        const key = interaction.options.getString('key');
        
        try {
            // Validate the API key
            if (await this.transcriptionService._validateOpenAIKey(key)) {
                // Store the key in memory
                this.guildConfig.setOpenAIKey(interaction.guildId, key);
                
                await interaction.editReply({
                    content: '✅ API key validated and set successfully! The key will be stored in memory only and will need to be set again if the bot restarts.',
                    ephemeral: true
                });
            } else {
                await interaction.editReply({
                    content: '❌ Invalid OpenAI API key. Please check your key and try again.',
                    ephemeral: true
                });
            }
        } catch (error) {
            this.logger.error('Error setting API key:', error);
            await interaction.editReply({
                content: '❌ Failed to set API key. Please try again.',
                ephemeral: true
            });
        }
    }
} 