const BaseCommand = require('./BaseCommand');
const { SlashCommandBuilder } = require('@discordjs/builders');
const logger = require('../utils/logger');
const { MessageFlags } = require('discord.js');

class RecordCommand extends BaseCommand {
    constructor(services) {
        super(services);
        this.voiceRecorder = services.get('voiceRecorder');
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('record')
            .setDescription('Start recording and summarizing the voice channel conversation');
    }

    async execute(interaction) {
        try {
            // Check if user is in a voice channel first
            if (!interaction.member.voice.channel) {
                return await interaction.reply({ 
                    content: '❌ You need to be in a voice channel to use this command!',
                    flags: MessageFlags.Ephemeral
                });
            }

            this.deferReplyIfNeeded(interaction, false);
            
            logger.debug('[RecordCommand] Starting recording...');
            await this.voiceRecorder.startRecording(interaction.member.voice.channel);
            
            await interaction.editReply({
                content: [
                    '🎙️ **Started Recording!**',
                    'The bot will now record and summarize your voice channel conversation.',
                    '',
                    '💡 **Tips:**',
                    '• Speak clearly and at a normal pace',
                    '• Avoid background noise if possible',
                    '• Use `/stop` to end the recording'
                ].join('\n')
            });
        } catch (error) {
            const errorMessage = error.message === 'Recording already in progress' 
                ? '❌ A recording is already in progress in this server!'
                : error.message === 'OpenAI API key not set'
                    ? '❌ OpenAI API key not set. Please run `/setkey` to set your key.'
                    : '❌ Failed to start recording. Please try again.';
                
            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
            if(error.message !== 'Recording already in progress') {
                throw error; // Re-throw for logging purposes
            }
        }
    }
}

module.exports = RecordCommand; 