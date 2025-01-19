import BaseCommand from './BaseCommand.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { MessageFlags } from 'discord.js';
import logger from '../../utils/logger.js';
import { handleReply } from '../../utils/interactionHelper.js';
export default class StatusCommand extends BaseCommand {
    constructor(services) {
        super(services);
        this.voiceRecorder = services.get('voiceRecorder');
    }

    getData() {
        return new SlashCommandBuilder()
            .setName('status')
            .setDescription('Check the current recording status');
    }

    async execute(interaction) {
        try {
          
            logger.info('[StatusCommand] Checking recording status...');
            const status = await this.voiceRecorder.getStatus();
            if (!status || !status.isRecording) {
                await handleReply(
                    '🎙️ No active recording.',
                    interaction,
                    false
                );
                return;
            }

            const duration = Math.floor((Date.now() - status.startTime) / 1000);
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            
            await handleReply(
                [
                    '🎙️ **Recording Status**',
                    `Recording in: ${status.channelName}`,
                    `Duration: ${minutes}m ${seconds}s`,
                    `Participants: ${status.participants.join(', ') || 'None'}`
                ].join('\n'),
                interaction,
                false
            );
        } catch (error) {
            logger.error('[StatusCommand] Error:', error);
            
            const errorMessage = '❌ **Error:**  Failed to get recording status. Please try again.';
            await handleReply(
                errorMessage,
                interaction,
                false
            );
            throw error; // Re-throw for logging purposes
        }
    }
} 