const { PermissionsBitField } = require('discord.js');
const config = require('./config');
const logger = require('./utils/logger');
const RecordingEvents = require('./events/RecordingEvents');

class CommandHandler {
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
            'debug': this.handleDebug.bind(this)
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
        const command = this.commands[interaction.commandName];
        if (!command) {
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'Unknown command', 
                        ephemeral: true 
                    });
                }
            } catch (error) {
                this.logger.error('Failed to reply to unknown command:', error);
            }
            return;
        }

        let deferred = false;
        try {
            // Try to defer only if not already handled
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.deferReply({ ephemeral: true });
                    deferred = true;
                } catch (error) {
                    if (error.code !== 10062 && error.code !== 40060) { // Ignore "unknown interaction" and "already acknowledged"
                        this.logger.error('Failed to defer reply:', error);
                    }
                }
            }

            await command(interaction);
        } catch (error) {
            this.logger.error(`Error executing command ${interaction.commandName}:`, error);
            
            try {
                const errorMessage = { 
                    content: 'An error occurred while executing the command. Please try again.',
                    ephemeral: true
                };
                
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply(errorMessage);
                } else if (interaction.deferred) {
                    await interaction.editReply(errorMessage);
                }
            } catch (replyError) {
                if (replyError.code !== 10062 && replyError.code !== 40060) { // Ignore expected errors
                    this.logger.error('Failed to send error message:', replyError);
                }
            }
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
            logger.debug('[CommandHandler] Stopping recording...');
            logger.debug('[CommandHandler] Guild ID:', interaction.guildId);
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
}

module.exports = CommandHandler; 