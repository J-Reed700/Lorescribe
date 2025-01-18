const { Collection } = require('discord.js');
const logger = require('../utils/logger');

class CommandRegistry {
    constructor(container) {
        this.commands = new Collection();
        this.container = container;
        this.logger = container.get('logger');
        this.loadCommands();
    }

    async loadCommands() {
        // Load all command modules
        const commandModules = [
            require('./RecordCommand'),
            require('./StopCommand'),
            require('./StatusCommand'),
            require('./SetChannelCommand'),
            require('./SetTimeIntervalCommand')
        ];

        // Register each command
        for (const CommandClass of commandModules) {
            const command = new CommandClass(this.container);
            this.commands.set(command.data.name, command);
        }
    }

    async handleCommand(interaction) {

        logger.info("Command Name: ", interaction.commandName);
        
        const command = this.commands.get(interaction.commandName);
        
        if (!command) {
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'Unknown command', 
                        flags: 64  // Ephemeral flag
                    });
                }
            } catch (error) {
                this.logger.error('Failed to reply to unknown command:', error);
            }
            return;
        }

        try {
            // Execute the command with a longer timeout for voice operations
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Command execution timed out')), 60000);
            });

            await Promise.race([
                command.execute(interaction).catch(error => {
                    if (error.code === 10062) {
                        // Ignore unknown interaction errors as they're usually due to Discord timing
                        return;
                    }
                    throw error;
                }),
                timeoutPromise
            ]);
        } catch (error) {
            if (error.message === 'Command execution timed out') {
                this.logger.warn(`Command ${interaction.commandName} timed out`);
                return;
            }

            this.logger.error(`Error executing command ${interaction.commandName}:`, error);
            
            try {
                const errorMessage = { 
                    content: 'An error occurred while executing the command.',
                    flags: 64  // Ephemeral flag
                };
                
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply(errorMessage);
                } else if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply(errorMessage);
                }
            } catch (replyError) {
                if (replyError.code !== 10062 && replyError.code !== 40060) {
                    // Only log errors that aren't related to interaction timing
                    this.logger.error('Failed to send error message:', replyError);
                }
            }
        }
    }
}

module.exports = CommandRegistry;
