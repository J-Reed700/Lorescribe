import BaseCommand from './BaseCommand.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import logger from '../../utils/logger.js';
import { handleReply } from '../../utils/interactionHelper.js';

export default class StopCommand extends BaseCommand {
    constructor(services) {
        super(services);
        this.voiceRecorder = services.get('voiceRecorder');
    }

    getData() {
        return new SlashCommandBuilder()
            .setName('stop')
            .setDescription('Stop recording and generate a summary');
    }

    async execute(interaction) {
        try {
            await this.deferReplyIfNeeded(interaction, false);
            
            logger.info('[StopCommand] Stopping recording...');
            await this.voiceRecorder.stopRecording(interaction.guildId);
            
            await handleReply(
                [
                    '🛑 **Recording Stopped!**',
                    'The bot will now process the recording and generate a summary.',
                    '',
                    '⏳ Please wait while the audio is being processed...'
                ].join('\n'),
                interaction,
                false,
                true
            );
        } catch (error) {
            const errorMessage = error.message === 'No recording in progress' 
                ? '❌ **Error:** There is no recording in progress!'
                : '❌ **Error:** Failed to stop recording. Please try again.';
            
            if (error.message !== 'No recording in progress') {
                error.message = errorMessage;
                throw error;    
            }
        }
    }
} 