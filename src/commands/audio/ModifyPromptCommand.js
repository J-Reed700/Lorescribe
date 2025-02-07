import BaseCommand from './BaseCommand.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import logger from '../../utils/logger.js';
import { handleReply } from '../../utils/interactionHelper.js';

export default class ModifyPromptCommand extends BaseCommand {
  constructor(services) {
    super(services);
    this.configService = services.get('config');
  }

  getData() {
    return new SlashCommandBuilder()
      .setName('modifyprompt')
      .setDescription('Modify the AI prompt used for summarizing recordings')
      .addStringOption(option =>
        option.setName('prompt')
          .setDescription('The new prompt to use for summarization')
          .setRequired(true));
  }

  async execute(interaction) {
    try {
      await this.deferReplyIfNeeded(interaction, false);

      const newPrompt = interaction.options.getString('prompt');
      
      await this.configService.setSummaryPrompt(interaction.guildId, newPrompt);

      logger.info('[ModifyPromptCommand] Prompt updated successfully');

      const response = [
        '✅ **Prompt Updated Successfully!**',
        'The AI will now use your custom prompt for future summaries.',
        '',
        '💡 **Note:**',
        '• Make sure your prompt is clear and specific',
        '• Test the new prompt with a short recording',
        '• You can always modify it again if needed'
      ].join('\n');

      const [success, message] = await handleReply(response, interaction, false, true);
      if (success) {
        return message;
      }

    } catch (error) {
      logger.error('[ModifyPromptCommand] Error:', error);
      const errorMessage = '❌ **Error:** Failed to update the prompt. Please try again.';
      throw new Error(errorMessage);
    }
  }
}
