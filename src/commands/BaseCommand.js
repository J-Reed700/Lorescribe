const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');
class BaseCommand {
    constructor(services) {
        this.services = services;
        this.logger = services.get('logger');
        
        if (this.constructor === BaseCommand) {
            throw new Error('Cannot instantiate abstract BaseCommand');
        }
    }

    // Abstract method that must be implemented by subclasses
    get data() {
        throw new Error('Command must implement data getter');
    }

    // Abstract method that must be implemented by subclasses
    async execute(interaction) {
        throw new Error('Command must implement execute method');
    }

    // Helper methods for common command operations
    async deferReplyIfNeeded(interaction, useEphemeral = true, options = { flags: MessageFlags.Ephemeral }) {
        if (!interaction.replied && !interaction.deferred) {
            if(useEphemeral) {
                await interaction.deferReply(options);
            }
            else {
                await interaction.deferReply();
            }
        }
    }

    async sendError(interaction, message, options = {}) {
        const errorMessage = { 
            content: message || 'An error occurred while executing the command.',
            flags: MessageFlags.Ephemeral,
            ...options
        };

        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply(errorMessage);
            } else {
                await interaction.editReply(errorMessage);
            }
        } catch (error) {
            this.logger.error('Failed to send error message:', error);
        }
    }

    async checkVoiceChannel(interaction) {
        if (!interaction.member.voice.channel) {
            await this.sendError(interaction, '❌ You need to be in a voice channel to use this command!');
            return false;
        }
        return true;
    }
}

module.exports = BaseCommand; 