import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import logger from './utils/logger.js';
import ServiceFactory from './services/ServiceFactory.js';
import baseConfig from './config.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const services = await new ServiceFactory(baseConfig).initialize();

const commands = [];
// Grab all the command folders from the commands directory
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		try {
			// Skip known non-command files
			if (file === 'BaseCommand.js' || file === 'CommandRegistry.js' || file === 'SlashCommands.js') {
				continue;
			}

			const { default: CommandClass } = await import(filePath);
			
			if (!CommandClass) {
				logger.warn(`[WARNING] The command at ${filePath} doesn't export a default class.`);
				continue;
			}

			// Instantiate the command class with services
			const command = new CommandClass(services);
			
			if (typeof command.getData !== 'function') {
				logger.warn(`[WARNING] The command at ${filePath} is missing the getData method.`);
				continue;
			}

			if (typeof command.execute !== 'function') {
				logger.warn(`[WARNING] The command at ${filePath} is missing the execute method.`);
				continue;
			}

			const data = command.getData();
			commands.push(data.toJSON());
			logger.info(`Loaded command: ${data.name}`);

		} catch (error) {
			logger.error(`Error loading command from ${filePath}:`, error);
		}
	}
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

try {
	logger.info(`Started refreshing ${commands.length} application (/) commands.`);

    if (process.env.GUILD_ID) {
        // Deploy to guild
        const guildResult = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
    }

    // Then deploy globally
    const globalResult = await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
    );

	logger.info(`Successfully reloaded ${commands.length} application (/) commands.`);
} catch (error) {
	logger.error('Error deploying commands:', error);
	if (error.rawError) {
		logger.error('Detailed error:', JSON.stringify(error.rawError, null, 2));
	}
	process.exit(1);
}
