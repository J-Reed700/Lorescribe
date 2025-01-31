import BaseCommand from './BaseCommand.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { ChannelType } from 'discord.js';
import { handleReply } from '../../utils/interactionHelper.js';
import RetryHandler from '../../utils/RetryHandler.js';
export default class SetSummaryChannelCommand extends BaseCommand {
    constructor(services) {
        super(services);
        this.config = services.get('config');
        this.retryHandler = new RetryHandler(3, 1000);
    }


    getData() {
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
            await this.retryHandler.execute(() => this.config.setSummaryChannel(interaction.guildId, channel.id));
            
            await handleReply(
                `✅ Summaries will now be posted in ${channel}`,
                interaction,
                false,
                true
            );
        } catch (error) {
            const errorMessage = error.message === 'Bot does not have permission to send messages in this channel'
                ? '❌ **Error:** I don\'t have permission to send messages in that channel!'
                : '❌ **Error:**     Failed to set summary channel. Please try again.';
            
            
            if (!error.message.includes('permission')) {
                error.message = errorMessage;
                throw error;
            }
        }
    }
}