const BaseCommand = require('./BaseCommand');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { ChannelType, MessageFlags } = require('discord.js');

class SetChannelCommand extends BaseCommand {
    constructor(services) {
        super(services);
        this.guildConfig = services.get('config');
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('setsummarychannel')
            .setDescription('Set the channel where summaries will be posted')
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('The text channel to post summaries in')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText)
            );
    }

    async execute(interaction) {
        try {
            
            const channel = interaction.options.getChannel('channel');
            if (!channel || channel.type !== 0) { // 0 is GUILD_TEXT
                await interaction.editReply({ 
                    content: 'Please specify a valid text channel!'
                });
                return;
            }

            await this.guildConfig.setSummaryChannel(interaction.guildId, channel.id);
            await interaction.editReply({ 
                content: `✅ Summary channel set to ${channel.name}!`
            });
        } catch (error) {
            this.logger.error('Error setting summary channel:', error);
            
            if (interaction.deferred) {
                await interaction.editReply({ 
                    content: '❌ Failed to set summary channel. Please try again.'
                });
            } else {
                await interaction.reply({
                    content: '❌ Failed to set summary channel. Please try again.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
}

module.exports = SetChannelCommand;