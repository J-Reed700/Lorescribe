import logger from '../utils/logger.js';
import { joinVoiceChannel, VoiceConnectionStatus, entersState, getVoiceConnection } from '@discordjs/voice';
import { EventEmitter } from 'events';

export default class VoiceStateService extends EventEmitter {
    constructor() {
        super();
    }

    async joinChannel(channel) {
        const guildId = channel.guild.id;
        await this.leaveChannel(guildId);

        let lastError = null;
        const maxAttempts = 3;
        const baseDelay = 2000; // 2 seconds

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId,
                    adapterCreator: channel.guild.voiceAdapterCreator,
                    selfDeaf: false,
                    debug: true // Enable debug logging
                });
                
                // Wait for connection to be ready
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        connection.destroy();
                        reject(new Error('Connection timed out'));
                    }, 30000); // 30 second timeout

                    const cleanup = () => {
                        clearTimeout(timeout);
                        connection.removeAllListeners();
                    };

                    // Handle all possible state transitions
                    connection.on('stateChange', async (oldState, newState) => {
                        logger.info(`[VoiceStateService] Connection state changed from ${oldState.status} to ${newState.status} for guild ${guildId}`);
                        
                        switch (newState.status) {
                            case VoiceConnectionStatus.Ready:
                                logger.info(`[VoiceStateService] Connection ready for guild ${guildId}`);
                                cleanup();
                                resolve();
                                break;
                            
                            case VoiceConnectionStatus.Connecting:
                            case VoiceConnectionStatus.Signalling:
                                // These are normal transition states, just wait
                                break;
                            
                            case VoiceConnectionStatus.Disconnected:
                                try {
                                    await Promise.race([
                                        entersState(connection, VoiceConnectionStatus.Ready, 5_000),
                                        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                                        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                                    ]);
                                    // Seems to be reconnecting to a new channel
                                    break;
                                } catch (error) {
                                    // Seems to be a real disconnect
                                    connection.destroy();
                                    reject(new Error('Disconnected from voice channel'));
                                }
                                break;
                            
                            case VoiceConnectionStatus.Destroyed:
                                cleanup();
                                reject(new Error('Connection destroyed'));
                                break;
                            
                            default:
                                // Unknown state
                                logger.warn(`[VoiceStateService] Unknown connection state: ${newState.status}`);
                                break;
                        }
                    });

                    connection.on('error', (error) => {
                        const isServer500Error = error.message?.includes('500');
                        if (isServer500Error && attempt < maxAttempts) {
                            logger.warn(`[VoiceStateService] Discord server error for guild ${guildId}, will retry:`, error);
                        } else {
                            logger.error(`[VoiceStateService] Connection error for guild ${guildId}:`, error);
                        }
                        cleanup();
                        connection.destroy();
                        reject(error);
                    });
                });

                logger.info(`[VoiceStateService] Successfully connected to voice channel in guild ${guildId} (attempt ${attempt})`);
                return connection;

            } catch (error) {
                lastError = error;
                logger.warn(`[VoiceStateService] Failed to connect to voice channel in guild ${guildId} (attempt ${attempt}):`, error);
                
                // Clean up failed connection
                const failedConnection = getVoiceConnection(guildId);
                if (failedConnection) {
                    failedConnection.destroy();
                }

                // If it's a 500 error, wait longer before retrying
                const isServer500Error = error.message?.includes('500');
                
                // Wait before retrying with exponential backoff
                if (attempt < maxAttempts) {
                    const delay = isServer500Error ? 
                        baseDelay * Math.pow(3, attempt - 1) : // More aggressive exponential backoff for 500s
                        baseDelay * attempt; // Linear backoff for other errors
                    
                    logger.info(`[VoiceStateService] Waiting ${delay}ms before retry ${attempt + 1}/${maxAttempts}`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError || new Error(`Failed to connect to voice channel after ${maxAttempts} attempts`);
    }

    async leaveChannel(guildId) {
        const connection = getVoiceConnection(guildId);
        if (!connection) return;

        try {
            // Destroy the connection
            connection.destroy();
            connection.removeAllListeners();
            
            // Emit disconnected event
            if(this.emit) {
                this.emit('disconnected', guildId);
            }

        } catch (error) {
            logger.error(`Error cleaning up voice connection for guild ${guildId}:`, error);
        }
    }

    getConnection(guildId) {
        const connection = getVoiceConnection(guildId);
        if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
            return null;
        }
        return connection;
    }
}