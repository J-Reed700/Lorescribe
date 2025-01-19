import BaseCommand from './BaseCommand.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { handleReply } from '../../utils/interactionHelper.js';

export default class SetTimeIntervalCommand extends BaseCommand {
    constructor(services) {
        super(services);
        this.storage = services.get('storage');
    }

    getData() {
        return new SlashCommandBuilder()
            .setName('setinterval')
            .setDescription('Set how often summaries should be generated (in minutes)')
            .addIntegerOption(option =>
                option.setName('minutes')
                    .setDescription('Time between summaries (1-30 minutes)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(30)
            );
    }

    async execute(interaction) {
        try {
            await this.deferReplyIfNeeded(interaction, true);
            
            const minutes = interaction.options.getInteger('minutes');
            if (!minutes) {
                throw new Error('No interval provided');
            }

            // Additional validation
            if (minutes < 1 || minutes > 30) {
                throw new Error('Invalid interval');
            }

            // Save the interval
            await this.storage.setSummaryInterval(interaction.guildId, minutes);
            
            await handleReply(
                `✅ **Success!** Summary interval set to \`${minutes}\` minutes\n> Recordings will be processed every \`${minutes}\` minutes.`,
                interaction,
                false
            );
        } catch (error) {
            const errorMessage = error.message === 'Invalid interval'
                ? '❌ **Error:** Please provide a valid interval between 1 and 60 minutes.'
                : '❌ **Error:** Failed to set summary interval. Please try again.';

            await handleReply(
                errorMessage,
                interaction,
                false
            );

            
            if (!error.message.includes('Invalid interval')) {
                throw error; // Re-throw for logging purposes
            }
        }
    }
}    