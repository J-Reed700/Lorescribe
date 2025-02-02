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

const commands = [];

// Create minimal container with only required services
const container = await new ServiceFactory(baseConfig).initialize();

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

			// Instantiate the command class with minimal services
			const command = new CommandClass(container);
			
			if (typeof command.getData !== 'function') {
				logger.warn(`[WARNING] The command at ${filePath} is missing the getData method.`);
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

	// Deploy to guild
	const guildId = process.env.DISCORD_GUILD_ID;
	const clientId = process.env.DISCORD_CLIENT_ID;

	if (!clientId) {
		throw new Error('DISCORD_CLIENT_ID not set in environment variables');
	}

	if (guildId) {
		logger.info(`Deploying commands to guild ${guildId}...`);
		await rest.put(
			Routes.applicationGuildCommands(clientId, guildId),
			{ body: commands }
		);
		logger.info('Guild commands deployed successfully');
	}

	// Deploy globally
	logger.info('Deploying commands globally...');
	await rest.put(
		Routes.applicationCommands(clientId),
		{ body: commands }
	);
	logger.info('Global commands deployed successfully');

	logger.info(`Successfully reloaded ${commands.length} application (/) commands.`);
} catch (error) {
	logger.error('Error deploying commands:', error);
	if (error.rawError) {
		logger.error('Detailed error:', JSON.stringify(error.rawError, null, 2));
	}
	process.exit(1);
}
