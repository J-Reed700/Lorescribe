const BaseCommand = require('./BaseCommand');
const { SlashCommandBuilder } = require('@discordjs/builders');

class StatusCommand extends BaseCommand {
    constructor(services) {
        super(services);
        this.voiceRecorder = services.get('voiceRecorder');
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('status')
            .setDescription('Check the status of the current recording session');
    }

    async execute(interaction) {
        await this.deferReplyIfNeeded(interaction);
        const status = this.voiceRecorder.getStatus(interaction.guildId);
        
        if (!status) {
            await interaction.editReply({ 
                content: 'No active recording session.'
            });
            return;
        }

        const minutes = Math.floor(status.elapsedMinutes);
        const message = [
            '**Recording Status:**',
            `⏱️ Duration: ${minutes} minutes`,
            `📊 Processed Chunks: ${status.processedChunks}/${status.maxChunks}`,
            `⌛ Time Remaining: ${Math.floor(status.timeRemaining)} minutes`,
            `${status.paused ? '⏸️ Recording is paused' : '▶️ Recording is active'}`
        ].join('\n');

        await interaction.editReply({ content: message });
    }
}

module.exports = StatusCommand; 