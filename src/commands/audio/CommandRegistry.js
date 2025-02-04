import RetryHandler from '../../utils/RetryHandler.js';
import RecordCommand from './RecordCommand.js';
import StopCommand from './StopCommand.js';
import StatusCommand from './StatusCommand.js';
import SetSummaryChannelCommand from './SetSummaryChannelCommand.js';
import SetKeyCommand from './SetKeyCommand.js';
import SetTimeIntervalCommand from './SetTimeIntervalCommand.js';
import logger from '../../utils/logger.js';
import { MessageFlags } from 'discord.js';
import { handleReply } from '../../utils/interactionHelper.js';

export default class CommandRegistry {
    constructor(container) {
        this.container = container;
        this.commands = new Map();
        this.retryHandler = new RetryHandler(3, 1000); // 3 retries, starting with 1s delay
        this.registerCommands();
    }

    registerCommands() {
        const commands = [
            RecordCommand,
            StopCommand,
            StatusCommand,
            SetSummaryChannelCommand,
            SetKeyCommand,
            SetTimeIntervalCommand,
        ];

        // Register each command
        for (const command of commands) {
            const commandInstance = new command(this.container);
            const data = commandInstance.getData();
            this.commands.set(data.name, commandInstance);
        }
    }

    async handleCommand(interaction) {
        if (!interaction.commandName) {
            logger.warn('Received interaction without command name');
            return;
        }

        logger.info(`Command Name: ${interaction.commandName}`);
        
        const command = this.commands.get(interaction.commandName);
        
        if (!command) {
            try {
                logger.warn('Unknown command received:', interaction.commandName);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'Unknown command', 
                        flags: MessageFlags.Ephemeral
                    });
                }
            } catch (error) {
                handleReply(error.message, interaction, true);
                logger.error('Failed to reply to unknown command:', error);
            }
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            // Handle command execution errors
            if (error?.message === 'Command execution timed out') {
                logger.warn(`Command ${interaction.commandName} timed out`);
                await this.handleErrorResponse(interaction, '⚠️ Command timed out. Please try again.');
                return;
            }
            logger.error(`Error executing command ${interaction.commandName}:`, error);
            await this.handleErrorResponse(interaction, error.message);
            throw error; // Still throw for logging purposes
        }
    }

    async handleErrorResponse(interaction, message) {
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: message,
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.editReply({
                    content: message
                });
            }
        } catch (error) {
            logger.error('Failed to send error response:', error);
        }
    }
}