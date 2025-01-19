import BaseCommand from './BaseCommand.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { ChannelType } from 'discord.js';
import { handleReply } from '../../utils/interactionHelper.js';

export default class SetChannelCommand extends BaseCommand {
    constructor(services) {
        super(services);
        this.storage = services.get('storage');
    }


    getData() {
        return new SlashCommandBuilder()
            .setName('setchannel')
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
            await this.deferReplyIfNeeded(interaction, true);
            
            const channel = interaction.options.getChannel('channel');
            if (!channel) {
                throw new Error('No channel provided');
            }

            // Check if bot has permission to send messages in the channel
            const permissions = channel.permissionsFor(interaction.client.user);
            if (!permissions?.has('SendMessages')) {
                throw new Error('Bot does not have permission to send messages in this channel');
            }

            // Save the channel ID
            await this.storage.setSummaryChannel(interaction.guildId, channel.id);
            
            await handleReply(
                `✅ Summaries will now be posted in ${channel}`,
                interaction,
                false
            );
        } catch (error) {
            const errorMessage = error.message === 'Bot does not have permission to send messages in this channel'
                ? '❌ I don\'t have permission to send messages in that channel!'
                : '❌ Failed to set summary channel. Please try again.';
            
            await handleReply(
                errorMessage,
                interaction,
                false
            );
            
            
            if (!error.message.includes('permission')) {
                throw error; // Re-throw for logging purposes
            }
        }
    }
}