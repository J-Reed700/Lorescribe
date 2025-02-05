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

            // Validate key format
            if (!key.startsWith('sk-') || key.length < 40) {
                throw new Error('Invalid API key format');
            }

            // Save the validated API key
            await this.config.setOpenAIKey(interaction.guildId, key);
            
            await handleReply(
                '✅ **Success!** OpenAI API key has been validated and set\n> The key will be stored securely in memory only.',
                interaction,
                true,
                true
            );

        } catch (error) {
            let errorMessage = error.message;
            switch(error.message) {
                case 'Invalid API key format':
                    errorMessage = '❌ **Error:** Invalid API key format\n> The key should start with `sk-` and be at least 40 characters long.';
                    break;
                case 'No API key provided':
                    errorMessage = '❌ **Error:** No API key provided\n> Please provide a valid OpenAI API key.';
                    break;
                case 'Invalid API key':
                    errorMessage = '❌ **Error:** The provided API key is invalid\n> Please check your OpenAI API key and try again.';
                    break;
                case 'Request failed with status code 401':
                    errorMessage = '❌ **Error:** Authentication failed\n> The API key appears to be invalid or revoked.';
                    break;
                case 'Request failed with status code 429':
                    errorMessage = '❌ **Error:** Rate limit exceeded\n> Please try again in a few minutes.';
                    break;
                default:
                    errorMessage = '❌ **Error:** Failed to set API key. Please try again.';
            }

            throw new Error(errorMessage);
        }
    }
}