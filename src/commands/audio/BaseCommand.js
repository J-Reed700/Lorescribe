import { MessageFlags } from 'discord.js';

export default class BaseCommand {
    constructor(services) {
        this.services = services;
    }

    getData() {
        throw new Error('getData() must be implemented by subclass');
    }

    async execute(interaction) {
        throw new Error('execute() must be implemented by subclass');
    }

    async deferReplyIfNeeded(interaction, ephemeral = true, options = { MessageFlags: MessageFlags.Ephemeral }) {
        if (!interaction.deferred && !interaction.replied) {
            if(ephemeral) {
                await interaction.deferReply(options);
            } else {
                await interaction.deferReply();
            }
        }
    }
} 