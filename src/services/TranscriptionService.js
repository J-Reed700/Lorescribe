import fs from 'node:fs';
import logger from '../utils/logger.js';
import ITranscriptionService from '../interfaces/ITranscriptionService.js';
import { OpenAI } from 'openai';

export default class TranscriptionService extends ITranscriptionService {
  constructor(config, configService) {
    super();
    this.config = config;
    this.configService = configService;
    this.openaiClients = new Map(); // Map to store initialized clients per guild
  }

  getOpenAIClient(guildId) {
    if (this.openaiClients.has(guildId)) {
      return this.openaiClients.get(guildId);
    }
    const apiKey = this.configService.getOpenAIKey(guildId);
    if (!apiKey) {
      throw new Error('OpenAI API key not set');
    }
    const client = new OpenAI({ apiKey });
    this.openaiClients.set(guildId, client);
    return client;
  }

  async transcribeAudio(audioPath, guildId) {
    const maxRetries = 3;
    let lastError = null;
    const stats = await fs.promises.stat(audioPath);
    if (stats.size < 2000) {
      throw new Error('Audio file too small for transcription');
    }
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          logger.info(`[TranscriptionService] Retry ${attempt + 1}/${maxRetries}, waiting ${backoffMs}ms`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
        logger.info(`[TranscriptionService] Starting transcription (attempt ${attempt + 1}/${maxRetries}):`, {
          filepath: audioPath,
          exists: fs.existsSync(audioPath)
        });
        const stats = await fs.promises.stat(audioPath);
        logger.info(`[TranscriptionService] File stats:`, {
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        });
        const openai = this.getOpenAIClient(guildId);
        logger.info(`[TranscriptionService] Transcribing with guildId: ${guildId}`);
        logger.info('[TranscriptionService] Creating read stream and sending to OpenAI...');
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(audioPath),
          model: "whisper-1",
          language: "en",
          response_format: "text",
          prompt: this.config.TRANSCRIPTION_PROMPT
        });
        logger.info(`[TranscriptionService] Transcription completed:`, {
          length: transcription?.length || 0,
          hasContent: !!transcription,
          text: transcription?.substring?.(0, 100) || 'No text'
        });
        if (!transcription || typeof transcription !== 'string') {
          throw new Error('Invalid transcription format received');
        }
        const trimmedTranscription = transcription.trim();
        if (trimmedTranscription.length === 0 || trimmedTranscription === '\n') {
          throw new Error('Empty transcription received');
        }
        return trimmedTranscription;
      } catch (error) {
        lastError = error;
        const isRetryableError = error.code === 'ECONNRESET' || 
                                   error.code === 'ETIMEDOUT' ||
                                   error.type === 'system' ||
                                   error.status === 429 ||
                                   (error.status >= 500 && error.status < 600) ||
                                   error.message === 'Empty transcription received' ||
                                   error.message === 'Invalid transcription format received';
        if (!isRetryableError || attempt === maxRetries - 1) {
          logger.error('[TranscriptionService] Transcription failed after all retries:', {
            error: error.message,
            code: error.code,
            type: error.type,
            status: error.status,
            stack: error.stack
          });
          throw error;
        }
        logger.warn(`[TranscriptionService] Transcription attempt ${attempt + 1} failed:`, {
          error: error.message,
          code: error.code,
          type: error.type,
          status: error.status
        });
      }
    }
    throw lastError;
  }

  async generateSummary(transcript, guildId) {
    try {
      if (!transcript || transcript.trim().length === 0) {
        throw new Error('Empty transcript provided');
      }
      logger.info(`[TranscriptionService] Starting summary generation`, {
        transcriptLength: transcript?.length || 0,
        transcriptSample: transcript?.substring(0, 100)
      });
      let summary = "";
      let isTranscription = false;
      let isUnableToSummarize = false;
      let completion;
      let i = 0;
      let model = "";
      while (i < 4) {
        try {
          switch(i) {
            case 0:
              model = "gpt-4";
              break;
            case 1:
              model = "gpt-3.5-turbo";
              break;
            case 2:
              model = "gpt-4-turbo-preview";
              break;
            case 3:
              model = "gpt-3.5-turbo-16k";
              break;
          }
          if (i > 0) {
            const backoffMs = 2 * i * 1000;
            logger.info(`[TranscriptionService] Retry ${i+1}/4, waiting ${backoffMs}ms`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
          logger.info(`[TranscriptionService] Sending summary prompt to OpenAI with model ${model}`);
          const openai = this.getOpenAIClient(guildId);
          completion = await openai.chat.completions.create({
            model: model,
            messages: [
              {
                role: "system",
                content: this.config.SUMMARY_PROMPT
              },
              {
                role: "user",
                content: transcript
              }
            ],
            temperature: 0.7,
            max_tokens: 1000
          });
          const content = completion?.choices?.[0]?.message?.content;
          if (!content || content.includes('No transcript available')) {
            logger.warn('[TranscriptionService] No valid summary generated, retrying...', {
              responseContent: content
            });
            i++;
            continue;
          }
          if (content.includes('Unable to summarize')) {
            logger.warn('[TranscriptionService] Unable to summarize, using transcript as fallback', {
              responseContent: content
            });
            isTranscription = true;
            isUnableToSummarize = true;
            summary = transcript;
            break;
          }
          summary = content;
          break;
        } catch (error) {
          logger.error('[TranscriptionService] Error during summary attempt:', {
            attempt: i + 1,
            model,
            error: error.message
          });
          i++;
        }
      }
      if (!summary) {
        isTranscription = true;
        summary = transcript;
      }
      logger.info(`[TranscriptionService] Summary generated successfully:`, {
        length: summary.length,
        transcriptLength: transcript?.length || 0,
        summary: summary.substring(0, 100)
      });
      return { summary, isTranscription, isUnableToSummarize };
    } catch (error) {
      const errorDetails = {
        location: 'TranscriptionService.generateSummary',
        error: {
          name: error.name,
          message: error.message,
          status: error.status,
          code: error.code,
          type: error.type,
          stack: error.stack
        },
        context: {
          transcriptLength: transcript?.length || 0,
          transcriptSample: transcript?.substring(0, 100) || 'No transcript'
        }
      };
      logger.error('[TranscriptionService] Summary generation failed:', errorDetails);
      throw error;
    }
  }

  async _validateOpenAIKey(key) {
    try {
      logger.info('[TranscriptionService] Validating OpenAI API key');
      await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "test" }],
        max_tokens: 1
      });
      logger.info('[TranscriptionService] API key validation successful');
      return true;
    } catch (error) {
      const errorDetails = {
        location: 'TranscriptionService._validateOpenAIKey',
        error: {
          name: error.name,
          message: error.message,
          status: error.status,
          code: error.code,
          type: error.type,
          stack: error.stack
        }
      };
      if (error.response) {
        errorDetails.openai = {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        };
      }
      logger.error('[TranscriptionService] API key validation failed:', errorDetails);
      return false;
    }
  }
}
