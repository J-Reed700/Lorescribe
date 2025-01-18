const { SlashCommandBuilder } = require('@discordjs/builders');

class SetKeyCommand {
    constructor(services) {
        this.services = services;
        this.config = services.get('config');
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('setkey')
            .setDescription('Set your OpenAI API key for this server (stored in memory only).')
            .addStringOption(option => option.setName('key')
            .setDescription('Your OpenAI API key')
            .setRequired(true));
    }

    async execute(interaction) {
        const key = interaction.options.getString('key');
        this.config.setOpenAIKey(interaction.guildId, key);
        await interaction.reply({ content: 'OpenAI API key set successfully!', ephemeral: true });
    }

}

module.exports = SetKeyCommand;