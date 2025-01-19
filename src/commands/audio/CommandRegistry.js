import RecordCommand from './RecordCommand.js';
import StopCommand from './StopCommand.js';
import StatusCommand from './StatusCommand.js';
import SetChannelCommand from './SetChannelCommand.js';
import SetKeyCommand from './SetKeyCommand.js';
import SetTimeIntervalCommand from './SetTimeIntervalCommand.js';
import logger from '../../utils/logger.js';
import { MessageFlags } from 'discord.js';

export default class CommandRegistry {
    constructor(container) {
        this.container = container;
        this.commands = new Map();
        this.registerCommands();
    }

    registerCommands() {
        const commands = [
            RecordCommand,
            StopCommand,
            StatusCommand,
            SetChannelCommand,
            SetKeyCommand,
            SetTimeIntervalCommand
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
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'Unknown command', 
                        flags: MessageFlags.Ephemeral
                    });
                }
            } catch (error) {
                logger.error('Failed to reply to unknown command:', error);
            }
            return;
        }

        try {
            // Execute the command with a longer timeout for voice operations
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Command execution timed out')), 60000);
            });

            await Promise.race([
                command.execute(interaction),
                timeoutPromise
            ]);
        } catch (error) {
            // Handle command execution errors
            if (error?.message === 'Command execution timed out') {
                logger.warn(`Command ${interaction.commandName} timed out`);
                return;
            }

            logger.error(`Error executing command ${interaction.commandName}:`, error);
            throw error; // Let the Bot class handle the error response
        }
    }
}
