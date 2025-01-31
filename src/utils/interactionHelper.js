import { MessageFlags } from 'discord.js';
import logger from '../utils/logger.js';

export async function handleReply(message, interaction, ephemeral = true, wasSuccessful = false) {
    try {
        // Log the full interaction state
        logger.info('[handleReply] Interaction state:', {
            deferred: interaction.deferred,
            replied: interaction.replied,
            message: message,
            ephemeral: ephemeral,
            interactionId: interaction.id,
            commandName: interaction.commandName,
            isCommand: interaction.isCommand(),
            isMessageComponent: interaction.isMessageComponent(),
            isModalSubmit: interaction.isModalSubmit()
        });

        // If the interaction is no longer valid, try each method in sequence
        if (!interaction.deferred && !interaction.replied) {
            try {
                logger.info('[handleReply] Attempting direct reply');
                if(ephemeral) {
                    await interaction.reply({ content: message, ephemeral: true });
                } else {
                    await interaction.reply(message);
                }
                return true, message;
            } catch (error) {
                logger.error('[handleReply] Direct reply failed:', error);
                // Continue to next attempt
            }
        }

        if (interaction.deferred) {
            try {
                logger.info('[handleReply] Attempting edit reply');
                if(ephemeral) {
                    await interaction.editReply({ content: message, ephemeral: true });
                } else {
                    await interaction.editReply(message);
                }
                return true, message;
            } catch (error) {
                logger.error('[handleReply] Edit reply failed:', error);
                // Continue to next attempt
            }
        }

        // Last resort - try followUp
        logger.info('[handleReply] Attempting followUp');
        try {
            if(ephemeral) {
                await interaction.followUp({ content: message, ephemeral: true });
            } else {
                await interaction.followUp(message);
            }
        } catch (error) {
            logger.error('[handleReply] FollowUp failed:', error);
            try {
                logger.info('[handleReply] Attempting editReply');
                if(ephemeral) {
                    await interaction.editReply({ content: message, ephemeral: true });
                } else {
                    await interaction.editReply(message);
                }
            } catch (error) {
                logger.error('[handleReply] Edit reply failed:', error);
                if(wasSuccessful) {
                    return true, message;
                }
                throw error;
            }
        }
    } catch(error) {
        logger.error('[handleReply] All reply attempts failed:', error);
        if(wasSuccessful) {
            return true, message;
        }
        throw error;
    }
}

/**
 * Discord Markdown formatting options:
 * **bold**
 * *italic* or _italic_
 * ***bold italic***
 * __underline__
 * ~~strikethrough~~
 * `code`
 * ```code block```
 * > quote
 * >>> multiline quote
 */
