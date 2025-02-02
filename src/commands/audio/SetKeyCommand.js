import BaseCommand from './BaseCommand.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { handleReply } from '../../utils/interactionHelper.js';
import RetryHandler from '../../utils/RetryHandler.js';

export default class SetKeyCommand extends BaseCommand {
    constructor(services) {
        super(services);
        this.config = services.get('config');
        this.retryHandler = new RetryHandler(3, 1000);
    }

    getData() {
        return new SlashCommandBuilder()
            .setName('setkey')
            .setDescription('Set your OpenAI API key for transcription and summarization.This is stored only in memory')
            .addStringOption(option =>
                option.setName('key')
                    .setDescription('Your OpenAI API key')
                    .setRequired(true)
            );
    }

    async execute(interaction) {
        try {
            await this.deferReplyIfNeeded(interaction, true);
            
            const key = interaction.options.getString('key');
            if (!key) {
                throw new Error('No API key provided');
            }

            // Basic validation of key format
            if (!key.startsWith('sk-') || key.length < 40) {
                throw new Error('Invalid API key format');
            }

            // Save the API key
            await this.config.setOpenAIKey(interaction.guildId, key);
            
            await handleReply(
                '✅ **Success!** OpenAI API key has been set\n> The key will be stored securely in memory only.',
                interaction,
                true,
                true
            );
        } catch (error) {
            const errorMessage = error.message === 'Invalid API key format'
                ? '❌ **Error:** Invalid API key format\n> The key should start with `sk-` and be at least 40 characters long.'
                : error.message === 'No API key provided'
                    ? '❌ **Error:** No API key provided\n> Please provide a valid OpenAI API key.'
                    : '❌ **Error:** Failed to set API key. Please try again.';
        
            
            if (!error.message.includes('Invalid API key') && !error.message.includes('No API key provided')) {
                error.message = errorMessage;
                throw error;
            }
        }
    }
}