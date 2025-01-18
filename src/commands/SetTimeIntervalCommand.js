const { SlashCommandBuilder } = require('discord.js');
const BaseCommand = require('./BaseCommand');

class SetTimeIntervalCommand extends BaseCommand {
    constructor(services) {
        super(services);
        this.logger = services.get('logger');
        this.guildConfig = services.get('config');
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('settimeinterval')
            .setDescription('Set the time interval for recording summaries in minutes')
            .addIntegerOption(option => option.setName('interval').setDescription('The time interval in minutes').setRequired(true));
    }

    async execute(interaction) {
        try {
            const interval = interaction.options.getInteger('interval');
            await this.guildConfig.setTimeInterval(interaction.guildId, interval);
            await interaction.editReply({ content: `✅ Time interval set to ${interval} minutes!` });
        } catch (error) {
            this.logger.error('Error setting time interval:', error);
            await interaction.editReply({ content: '❌ Failed to set time interval. Please try again.' });
        }
    }
}

module.exports = SetTimeIntervalCommand;    