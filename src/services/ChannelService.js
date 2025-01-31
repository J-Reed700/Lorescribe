export default class ChannelService {
    constructor(client, logger) {
        this.client = client;
        this.logger = logger;
        this.chunkedMessageAlert = "This message has been split into multiple messages due to Discord's message length limit."
    }

    async getChannel(channelId) {
        return await this.client.channels.fetch(channelId);
    }

    async sendErrorMessage(guildConfig, transummarize) {
        if (guildConfig?.summaryChannelId) {
            try {
                const {summary, isTranscription, jobId, isUnableToSummarize} = transummarize;
                
                if(isTranscription) {
                    await this.sendMessage(guildConfig.summaryChannelId, {    
                        content:
                         `📢❗🚨 **There was an error generating a summary** 📢❗🚨 \n
                            Direct transcription:\n\n${summary}\n
                        *This is a background generated job to retry, JobId:* ${jobId}`
                    }); 
                } 
                else if (isUnableToSummarize) {
                    await this.sendMessage(guildConfig.summaryChannelId, {
                        content: `🤔 **Unable to summarize recording** 🤔 \n
                        Direct transcription:\n\n${summary}\n`
                    });
                }
                else {
                    await this.sendMessage(guildConfig.summaryChannelId, {
                        content: `**Recording Summary**\n\n${summary}\n\n`
                    });
                }
            } catch (channelError) {
                this.logger.error('[VoiceRecorder] Error sending to summary channel:', channelError);
                // Don't throw - this is a non-critical error
            }
        }
    }
    async sendMessage(channelId, messageData) {
        const channel = await this.getChannel(channelId);
        if (!channel) {
            this.logger.error(`[ChannelService] Could not find channel ${channelId}`);
            return;
        }

        // Handle both string messages and message objects
        const content = typeof messageData === 'string' ? messageData : messageData.content;
        if (!content) {
            await channel.send(messageData);
            return;
        }

        if (content.length > 2000) {
            this.logger.warn(`[ChannelService] Message is too long (${content.length} chars), splitting into chunks`);
            await this.processMessage(channel, messageData);
        } else {
            this.logger.info(`[ChannelService] Sending message to channel`);
            await channel.send(messageData);
        }
    }

    async processMessage(channel, messageData) {
        const content = typeof messageData === 'string' ? messageData : messageData.content;
        const chunks = this.splitIntoChunks(content);
        
        // Send first chunk with alert
        const firstMessage = {
            ...typeof messageData === 'string' ? { content: chunks[0] } : messageData,
            content: chunks[0] + (chunks.length > 1 ? `\n\n${this.chunkedMessageAlert}` : '')
        };
        await channel.send(firstMessage);

        // Send remaining chunks
        for (let i = 1; i < chunks.length; i++) {
            const message = {
                ...typeof messageData === 'string' ? { content: chunks[i] } : messageData,
                content: chunks[i]
            };
            await channel.send(message);
        }
    }

    splitIntoChunks(content, maxLength = 1900) {
        const chunks = [];
        const lines = content.split('\n');
        let currentChunk = '';

        for (const line of lines) {
            // If adding this line would exceed maxLength, push current chunk and start new one
            if (currentChunk.length + line.length + 1 > maxLength) {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                }
                currentChunk = '';
            }
            
            // If the line itself is too long, split it
            if (line.length > maxLength) {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }
                // Split long line into maxLength chunks
                for (let i = 0; i < line.length; i += maxLength) {
                    chunks.push(line.slice(i, i + maxLength));
                }
            } else {
                currentChunk += (currentChunk ? '\n' : '') + line;
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    }
}   