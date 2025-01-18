require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./commands/SlashCommands');

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        console.log('Loading commands:', commands.map(cmd => cmd.name));

        // Deploy to a specific guild for faster updates during development
        if (process.env.GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands }
            );
            console.log('Successfully reloaded application (/) commands for development guild.');
        } else {
            // Fall back to global deployment if no guild ID is specified
            await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands }
            );
            console.log('Successfully reloaded application (/) commands globally.');
        }
    } catch (error) {
        console.error('Error refreshing commands:', error);
        // Log detailed error information
        if (error.rawError) {
            console.error('Detailed error:', JSON.stringify(error.rawError, null, 2));
        }
        process.exit(1);
    }
})(); 