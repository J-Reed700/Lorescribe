const BaseCommand = require('./BaseCommand');
const { SlashCommandBuilder } = require('@discordjs/builders');
const logger = require('../utils/logger');

class StopCommand extends BaseCommand {
    constructor(services) {
        super(services);
        this.voiceRecorder = services.get('voiceRecorder');
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('stop')
            .setDescription('Stop the current recording and generate a final summary');
    }

    async execute(interaction) {

        await this.deferReplyIfNeeded(interaction);

        logger.debug('[StopCommand] Executing...');
        logger.debug('[StopCommand] Guild ID:', interaction.guildId);
        const status = this.voiceRecorder.getStatus(interaction.guildId);
        if (!status) {
            await interaction.editReply({ 
                content: 'No active recording to stop.'
            });
            return;
        }

        await this.voiceRecorder.stopRecording(interaction.guildId);
        await interaction.editReply({ 
            content: '🛑 Recording stopped! Processing final summary...'
        });
    }
}

module.exports = StopCommand; 