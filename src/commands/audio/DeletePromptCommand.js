import BaseCommand from './BaseCommand.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import logger from '../../utils/logger.js';
import { handleReply } from '../../utils/interactionHelper.js';

export default class DeletePromptCommand extends BaseCommand {
  constructor(services) {
    super(services);
    this.configService = services.get('config');
  }

  getData() {
    return new SlashCommandBuilder()
      .setName('deleteprompt')
      .setDescription('Delete the custom AI prompt and revert to default prompt');
  }

  async execute(interaction) {
    try {
      await this.deferReplyIfNeeded(interaction, false);
      
      await this.configService.deleteSummaryPrompt(interaction.guildId);

      logger.info('[DeletePromptCommand] Prompt deleted successfully');

      const response = [
        '✅ **Custom Prompt Deleted Successfully!**',
        'The AI will now use the default prompt for future summaries.',
        '',
        '💡 **Note:**',
        '• You can set a new custom prompt anytime using /modifyprompt',
        '• The default prompt is optimized for general use'
      ].join('\n');

      const [success, message] = await handleReply(response, interaction, false, true);
      if (success) {
        return message;
      }

    } catch (error) {
      logger.error('[DeletePromptCommand] Error:', error);
      const errorMessage = '❌ **Error:** Failed to delete the prompt. Please try again.';
      throw new Error(errorMessage);
    }
  }
}
