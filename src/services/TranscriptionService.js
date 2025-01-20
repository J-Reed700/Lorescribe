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
        // Check if we already have a client for this guild
        if (this.openaiClients.has(guildId)) {
            return this.openaiClients.get(guildId);
        }

        // Get the API key for this guild
        const apiKey = this.configService.getOpenAIKey(guildId);
        if (!apiKey) {
            throw new Error('No OpenAI API key set for this server. Please set it using the /setkey command.');
        }

        // Initialize new client for this guild
        const client = new OpenAI({ apiKey });
        this.openaiClients.set(guildId, client);
        return client;
    }

    async transcribe(audioPath, guildId) {
        try {
            logger.info(`[TranscriptionService] Starting transcription:`, {
                filepath: audioPath,
                exists: fs.existsSync(audioPath)
            });

            const stats = await fs.promises.stat(audioPath);
            logger.info(`[TranscriptionService] File stats:`, {
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime
            });

            // Get the OpenAI client for this guild
            const openai = this.getOpenAIClient(guildId);

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
                prompt: this.config.TRANSCRIPTION_PROMPT
            });
            return transcription;
        } catch (error) {
            logger.error('[TranscriptionService] Transcription failed:', error);
            throw error;
        }
    }

    async generateSummary(transcript) {
        try {
            logger.info(`[TranscriptionService] Starting summary generation`, {
                transcriptLength: transcript?.length || 0,
                transcriptContent: transcript?.substring(0, 100)
            });
            let completion;
            let i = 0;
            let model = "";
            while(i < 4){
                switch(i) {
                    case 0:
                        model = "chatgpt-4o-latest";
                        break;
                    case 1:
                        model = "gpt-3.5-turbo";
                        break;
                    case 2:
                        model = "gpt-4o-mini";
                        break;
                    case 3:
                        model = "gpt-4o";
                        break;
                }
                if (i > 0) {
                    const backoffMs = 2 * i * 1000; 
                    logger.info(`[TranscriptionService] Retry ${i+1}/4, waiting ${backoffMs}ms`);
                    await new Promise(resolve => setTimeout(resolve, backoffMs));
                }
                logger.info(`[TranscriptionService] Sending summary prompt to OpenAI: ${transcript}`);
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
                            content: transcript || '' 
                        }
                    ]   
                });

                if (completion.choices[0].message.content.includes('No transcript available')) {
                    logger.warn('[TranscriptionService] No transcript available, retrying...', {
                        responseContent: completion.choices[0].message.content
                    });

                    if(i === 3) {
                        throw new Error('Failed to generate summary');
                    }
                }
                else {
                    break;
                }
                i++;
            }
            
            if (i === 3 && completion.choices[0].message.content.includes('No transcript available')) {
                throw new Error('Failed to generate summary after all retries');
            }

            const summary = completion.choices[0].message.content;
            logger.info(`[TranscriptionService] Summary generated successfully:`, {
                length: summary.length,
                transcriptLength: transcript?.length || 0
            });

            return summary;
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

            if (error.response) {
                errorDetails.openai = {
                    status: error.response.status,
                    statusText: error.response.statusText,
                    data: error.response.data
                };
            }

            logger.error('[TranscriptionService] Summary generation failed:', errorDetails);
            throw new Error(`Failed to generate summary: ${error.message}`);
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