import BaseCommand from './BaseCommand.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import logger from '../../utils/logger.js';
import { handleReply } from '../../utils/interactionHelper.js';

export default class RecordCommand extends BaseCommand {
    constructor(services) {
        super(services);
        this.voiceRecorder = services.get('voiceRecorder');
    }

    getData() {
        return new SlashCommandBuilder()
            .setName('record')
            .setDescription('Start recording and summarizing the voice channel conversation');
    }

    async execute(interaction) {
        try {
            // Check if user is in a voice channel first
            if (!interaction.member.voice.channel) {
                await handleReply(
                    '❌ **Error:** You need to be in a voice channel to use this command!',
                    interaction,
                    true
                );
                return;
            }

            // Defer the reply after the voice channel check
            await this.deferReplyIfNeeded(interaction, false);

            // Start recording
            logger.info('[RecordCommand] Starting recording...');
            await this.voiceRecorder.startRecording(interaction.member.voice.channel);
            
            // Send success message with rich formatting
            const response = [
                '🎙️ **Recording Started!**',
                'The bot will now record and summarize your voice channel conversation.',
                '',
                '💡 **Tips:**',
                '• `Speak clearly` and at a normal pace',
                '• `Avoid background noise` if possible',
                '• Use `/stop` to end the recording',
                '',
                '> Your recording will be automatically processed and summarized.',
                '> Use high-quality audio for best results.'
            ].join('\n');

            await handleReply(response, interaction, false);

        } catch (error) {
            const errorMessage = error.message === 'Recording already in progress' 
                ? '❌ **Error:** A recording is already in progress in this server!'
                : error.message === 'OpenAI API key not set'
                    ? '❌ **Error:** OpenAI API key not set. Please run `/setkey` to set your key.'
                    : '❌ **Error:** Failed to start recording. Please try again.';
            
            await handleReply(errorMessage, interaction, true);

            if (error.message !== 'Recording already in progress') {
                throw error; 
            }
        }
    }
} 
