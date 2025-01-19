import BaseCommand from './BaseCommand.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { handleReply } from '../../utils/interactionHelper.js';

export default class SetKeyCommand extends BaseCommand {
    constructor(services) {
        super(services);
        this.config = services.get('config');
    }

    
    getData() {
        return new SlashCommandBuilder()
            .setName('setkey')
            .setDescription('Set your OpenAI API key for transcription and summarization')
            .addStringOption(option =>
                option.setName('key')
                    .setDescription('Your OpenAI API key')
                    .setRequired(true)
            );
    }

    async execute(interaction) {
        try {
            // Basic validation of key format
            if (!key.startsWith('sk-') || key.length < 40) {
                throw new Error('Invalid API key format');
            }
            // Save the API key
            await this.config.setOpenAIKey(interaction.guildId, key);
            
            await handleReply(
                '✅ **Success!** OpenAI API key has been set\n> The key will be stored securely and used for transcription.',
                interaction,
                false
            );
        } catch (error) {
            const errorMessage = error.message === 'Invalid API key format'
                ? '❌ **Error:** Invalid API key format\n> The key should start with `sk-` and be at least 40 characters long.'
                : '❌ **Error:** Failed to set API key. Please try again.';
            
            await handleReply(
                errorMessage,
                interaction,
                false
            );

            
            if (!error.message.includes('Invalid API key')) {
                throw error; // Re-throw for logging purposes
            }
        }
    }
}