import { MessageFlags } from 'discord.js';

export async function handleReply(message, interaction, ephemeral = true) {
    if (!interaction.replied && !interaction.deferred) {
        if(ephemeral) {
            await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
        }
        else {
            await interaction.reply({ content: message });
        }
    }
    else  {
        if(ephemeral) {
            await interaction.editReply({ content: message, flags: MessageFlags.Ephemeral });
        }
        else {
            await interaction.editReply({ content: message });
        }
    }
}