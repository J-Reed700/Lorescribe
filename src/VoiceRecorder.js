import { EventEmitter } from 'events';
import fs from 'node:fs';
import logger from './utils/logger.js';
import RecordingEvents from './events/RecordingEvents.js';

export default class VoiceRecorder extends EventEmitter {
    constructor(services) {
        super();
        this.audioService = services.get('audio');
        this.voiceState = services.get('voiceState');
        this.configService = services.get('config');
        this.logger = services.get('logger');
        this.events = services.get('events');
        this.storage = services.get('storage');
        this.transcriptionService = services.get('transcription');
        this.summaryJobs = services.get('summaryJobs');
        this.channelService = services.get('channel');
        this.container = services;
        
        this.activeRecordings = new Map();

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.voiceState.on('disconnected', (guildId) => {
            if (this.activeRecordings.has(guildId)) {
                this.stopRecording(guildId).catch(error => {
                    this.logger.error(`[VoiceRecorder] Error stopping recording on disconnect:`, error);
                });
                this.events.emit(RecordingEvents.CONNECTION_CLOSED, { guildId });
            }
        });

        this.voiceState.on('error', ({ guildId, error }) => {
            this.logger.error(`[VoiceRecorder] Voice connection error in guild ${guildId}:`, error);
            this.events.emit(RecordingEvents.CONNECTION_ERROR, { guildId, error });
        });
    }

    async rotateStreams(guildId) {
        const recordingInfo = this.activeRecordings.get(guildId);
        if (!recordingInfo) {
            return;
        }

        try {
            // Store the voice channel for reuse
            const connection = recordingInfo.connection;

            // First, remove the old recording from active recordings to prevent duplicate events
            this.activeRecordings.delete(guildId);

            const { outputStream, opusDecoder, filename } = await this.audioService.createSteamAndOpusDecoder(guildId);

            // Create new recording info with all required components
            const newRecordingInfo = await this.audioService.StartRecording(connection, opusDecoder, outputStream);
            newRecordingInfo.filename = filename;
            
            // Update the active recording immediately to prevent race conditions
            this.activeRecordings.set(guildId, newRecordingInfo);

            // Now that the new recording is set up, process the old one
            // Wait for any pending writes to complete
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Process the old recording asynchronously
            this.processRotatedRecording(recordingInfo, guildId).catch(error => {
                this.logger.error('[VoiceRecorder] Error processing rotated recording:', error);
                this.events.emit(RecordingEvents.ROTATION_ERROR, { guildId, error });
            });

        } catch (error) {
            this.logger.error('[VoiceRecorder] Error rotating files:', error);
            // If rotation fails, try to maintain the existing recording
            if (!this.activeRecordings.has(guildId)) {
                // Put the old recording back if we failed to create a new one
                this.activeRecordings.set(guildId, recordingInfo);
            }
            this.events.emit(RecordingEvents.ROTATION_ERROR, { guildId, error });
            throw error;
        }
    }

    async processRotatedRecording(recordingInfo, guildId) {
        try {
            await this.closeStreams(recordingInfo);
            let isTranscription = false;
            let jobId = null;
            // Wait a bit to ensure all data is written
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Now that streams are cleaned up, process the recording
            const mp3File = await this.audioService.convertToMp3(recordingInfo.filename);
            const stats = await fs.promises.stat(recordingInfo.filename);

            if (stats.size === 0) {
                this.logger.warn('[VoiceRecorder] Skipping empty recording file');
                await this.storage.deleteFile(recordingInfo.filename);
                return;
            }

            // Process transcription and summary
            const transcript = await this.transcriptionService.transcribe(mp3File);
            
            // **Add this log to verify transcription content**
            this.logger.info(`[VoiceRecorder] Transcript received for guild ${guildId}: ${transcript.substring(0, 200)}...`);
            
            let summary = transcript; 
            try {
                summary = await this.transcriptionService.generateSummary(transcript);
            } catch (summaryError) {
                this.logger.warn(`[VoiceRecorder] Failed to generate summary, using transcript as fallback:`, summaryError);
                isTranscription = true;
                // Schedule background summary generation
                jobId = await this.summaryJobs.scheduleSummaryGeneration(guildId, transcript);
                this.logger.info(`[VoiceRecorder] Scheduled summary generation for guild ${guildId} with job ID: ${jobId}`);
            }

            // Save transcript
            const timestamp = Date.now();
            await this.storage.saveTranscript(guildId, transcript, timestamp);

            // Send to summary channel if configured
            await this.sendSummaryToChannel(guildId, summary, recordingInfo.startTime, isTranscription, jobId);

            // Emit events
            this.events.emit(RecordingEvents.INTERVAL_COMPLETED, {
                guildId,
                outputFile: mp3File,
                size: stats.size,
                duration: Date.now() - recordingInfo.startTime
            });

            this.events.emit(RecordingEvents.RECORDING_SUMMARIZED, {
                guildId,
                summary,
                transcript,
                timestamp
            });

            // Clean up the temporary files
            await this.storage.deleteFile(recordingInfo.filename);
            await this.storage.deleteFile(mp3File);
        } catch (error) {
            this.logger.error('[VoiceRecorder] Error processing recording:', error);
            throw error;
        }
    }

    async closeStreams(recordingInfo) {
        // Return a promise that resolves when all streams are properly closed
        return new Promise((resolve, reject) => {
            try {
                // Close audio streams
                if (recordingInfo.audioStreams) {
                    for (const [userId, audioStream] of recordingInfo.audioStreams) {
                        audioStream.unpipe();
                        audioStream.destroy();
                    }
                }

                // Close opus decoder
                if (recordingInfo.opusDecoder) {
                    recordingInfo.opusDecoder.unpipe();
                    recordingInfo.opusDecoder.destroy();
                }

                // Close output stream with proper end event handling
                if (recordingInfo.outputStream) {
                    recordingInfo.outputStream.end(() => {
                        this.logger.info('[VoiceRecorder] Output stream closed successfully');
                        resolve();
                    });

                    // Set a timeout in case the end event doesn't fire
                    const timeout = setTimeout(() => {
                        this.logger.warn('[VoiceRecorder] Output stream close timed out');
                        resolve();
                    }, 5000);

                    // Clean up the timeout if we close successfully
                    recordingInfo.outputStream.once('end', () => {
                        clearTimeout(timeout);
                    });
                } else {
                    resolve();
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    async sendSummaryToChannel(guildId, summary, startTime, isTranscription, jobId) {
        if (!guildId) return;

        const guildConfig = this.configService.getGuildConfig(guildId);
        
        if (guildConfig?.summaryChannelId) {
            try {
                const duration = Date.now() - startTime;
                const durationMinutes = Math.round(duration / 60000);
                if(isTranscription) {
                    await this.channelService.sendMessage(guildConfig.summaryChannelId, {    
                        content:
                         `❌ **There was an error generating a summary** ❌ \n
                            Direct transcription:\n\n${summary}\n
                        **JobId:** ${jobId}`
                    }); 
                } else {
                    await this.channelService.sendMessage(guildConfig.summaryChannelId, {
                        content: `**Recording Summary** (${durationMinutes} minutes)\n\n${summary}\n\n`
                });
                }
            } catch (channelError) {
                this.logger.error('[VoiceRecorder] Error sending to summary channel:', channelError);
                // Don't throw - this is a non-critical error
            }
        }
        this.logger.warn(`[VoiceRecorder] Summary Channel Failed to send to ${guildConfig?.summaryChannelId} summary: ${summary}`);
    }

    async startRecording(voiceChannel) {

        const guildId = voiceChannel.guild.id;
        const interval = await this.configService.getTimeInterval(guildId);
        
        //if(!this.configService.getOpenAIKey(guildId)) {
        //    throw new Error('OpenAI API key not set');
        //}

        if (this.activeRecordings.has(guildId)) {

            throw new Error('Recording already in progress');
        }

        try {
            this.logger.info('THIS SHOULD WORK');
            // Join the voice channel
            const connection = await this.voiceState.joinChannel(voiceChannel);
            this.logger.info(`[VoiceRecorder] Joined voice channel for guild ${guildId}`);
            if (!connection) {
                throw new Error('Failed to establish voice connection');
            }
            
            this.logger.info(`[VoiceRecorder] Joined voice channel for guild ${guildId}`);
            // Create the recording session
            const filename = this.storage.getTempFilePath(guildId, 'pcm');
            const outputStream = fs.createWriteStream(filename);
            const opusDecoder = await this.audioService.createOpusDecoder();
            
            if (!opusDecoder) {
                throw new Error('Failed to create opus decoder');
            }

            // Create recording info
            const recordingInfo = await this.audioService.StartRecording(connection, opusDecoder, outputStream);
            recordingInfo.filename = filename;

            // Set up rotation interval
            const rotationInterval = setInterval(() => {
                this.rotateStreams(guildId).catch(error => {
                    this.logger.error(`[VoiceRecorder] Error rotating files:`, error);
                });
            }, interval);

            // Store the interval for cleanup
            recordingInfo.rotationInterval = rotationInterval;

            // Log initial setup
            this.logger.info(`[VoiceRecorder] Started recording for guild ${guildId}`);
            this.activeRecordings.set(guildId, recordingInfo);
            this.events.emit(RecordingEvents.RECORDING_STARTED, { guildId });
            
            return recordingInfo;

        } catch (error) {
            this.logger.error(`[VoiceRecorder] Failed to start recording:`, error);
            await this.cleanup(guildId);
            throw error;
        }
    }

    async stopRecording(guildId) {   
        if (!guildId || !this.activeRecordings || this.activeRecordings.size === 0) return;
        this.logger.info(`[VoiceRecorder] Stopping recording for guild ${guildId}`);
        
        const recordingInfo = this.activeRecordings.get(guildId);
        recordingInfo.guildId = guildId;

        if (!recordingInfo) return;

        try {
            // Log final state
            this.logger.info(`[VoiceRecorder] Stopping recording:`, {
                dataReceived: recordingInfo.dataReceived,
                bytesWritten: recordingInfo.bytesWritten,
                duration: Date.now() - recordingInfo.startTime,
                speakingStates: Array.from(recordingInfo.speakingStates.entries())
            });

            const mp3File = await this.ClearStreamsAndSave(recordingInfo, true);
            const stats = await fs.promises.stat(recordingInfo.filename);

            this.events.emit(RecordingEvents.RECORDING_STOPPED, { 
                guildId,
                outputFile: mp3File,
                size: stats.size,
                duration: Date.now() - recordingInfo.startTime
            });

            return mp3File;
        } catch (error) {
            this.logger.error(`[VoiceRecorder] Error stopping recording:`, error);
            // Don't delete files on error so we can debug
            await this.cleanup(guildId, false);
            throw error;
        }
    }

    async cleanup(guildId, deleteFiles = true) {           
        // Leave the voice channel
        await this.voiceState.leaveChannel(guildId);
        const recordingInfo = this.activeRecordings.get(guildId);

        if (!recordingInfo) return;

        try {
            // Clear the rotation interval if it exists
            if (recordingInfo.rotationInterval) {
                clearInterval(recordingInfo.rotationInterval);
            }

            // Remove all event listeners from connection and receiver
            if (recordingInfo.connection) {
                recordingInfo.connection.removeAllListeners('stateChange');
            }
            if (recordingInfo.receiver) {
                recordingInfo.receiver.speaking.removeAllListeners('start');
                recordingInfo.receiver.speaking.removeAllListeners('end');
            }

            // Clean up all audio streams
            if (recordingInfo.audioStreams) {
                for (const [userId, audioStream] of recordingInfo.audioStreams) {
                    audioStream.unpipe();
                    audioStream.destroy();
                }
            }
            
            if (recordingInfo.opusDecoder) {
                recordingInfo.opusDecoder.unpipe();
                recordingInfo.opusDecoder.destroy();
            }
            
            // End the output stream properly
            if (recordingInfo.outputStream) {
                await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        this.logger.warn('[VoiceRecorder] Timeout waiting for output stream to end during cleanup');
                        resolve();
                    }, 5000);

                    recordingInfo.outputStream.end(() => {
                        clearTimeout(timeout);
                        resolve();
                    });
                });
            }

            // Delete the temp PCM file if requested
            if (deleteFiles && recordingInfo.filename) {
                await this.storage.deleteFile(recordingInfo.filename);
            }
        } catch (error) {
            this.logger.error(`[VoiceRecorder] Error during cleanup:`, error);
        } finally {
            this.activeRecordings.delete(guildId);
        }
    }

    async getStatus(guildId) {
        const recordingInfo = this.activeRecordings.get(guildId);
        if (!recordingInfo) return null;
        
        return {
            status: 'Recording',
            duration: Date.now() - recordingInfo.startTime,
            bytesWritten: recordingInfo.bytesWritten,
            hasData: recordingInfo.dataReceived,
            lastDataTime: recordingInfo.lastDataTime,
            speakingStates: Array.from(recordingInfo.speakingStates.entries()),
            activeStreams: Array.from(recordingInfo.audioStreams.keys())
        };
    }

    async ClearStreamsAndSave(recordingInfo, killProcess = false) {
        let isTranscription = false;
        let jobId = null;
        // Check if we received any data
        if (!recordingInfo.dataReceived) {
            throw new Error('No audio data was received during recording');
        }

        // End all audio streams
        for (const [userId, audioStream] of recordingInfo.audioStreams) {
            audioStream.unpipe();
            audioStream.destroy();
        }
        
        // End the decoder
        if (killProcess) {
            recordingInfo.opusDecoder.unpipe();
            recordingInfo.opusDecoder.destroy();
        }

        if (killProcess) {
            recordingInfo.outputStream.end();
            recordingInfo.outputStream.destroy();
        }

        recordingInfo.audioStreams.clear();
        recordingInfo.speakingStates.clear();

        // Wait for the output stream to finish
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout waiting for output stream to end'));
            }, 5000);

            recordingInfo.outputStream.end(() => {
                clearTimeout(timeout);
                this.logger.info('[VoiceRecorder] Output stream ended successfully');
                resolve();
            });
        });

        // Wait a bit to ensure all data is written
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (!fs.existsSync(recordingInfo.filename)) {
            this.logger.error('[VoiceRecorder] Recording file does not exist');
            return;
        }

        const stats = await fs.promises.stat(recordingInfo.filename);
        if (stats.size === 0) {
            throw new Error('Recording file is empty');
        }

        this.logger.info(`[VoiceRecorder] Recording size: ${stats.size} bytes`);

        // Convert to MP3
        const mp3File = await this.audioService.convertToMp3(recordingInfo.filename);
        
        try {
            const transcript = await this.transcriptionService.transcribeAudio(mp3File);
            const timestamp = Date.now();
            await this.storage.saveTranscript(recordingInfo.guildId, transcript, timestamp);
            
            let summary = transcript;
            try {
                summary = await this.transcriptionService.generateSummary(transcript);
            } catch (summaryError) {
                this.logger.warn(`[VoiceRecorder] Failed to generate summary in ClearStreamsAndSave, using transcript as fallback:`, summaryError);
                isTranscription = true;
                // Schedule background summary generation
                jobId = await this.summaryJobs.scheduleSummaryGeneration(recordingInfo.guildId, transcript);
                this.logger.info(`[VoiceRecorder] Scheduled summary generation for guild ${recordingInfo.guildId} with job ID: ${jobId}`);
            }

            this.logger.info('[VoiceRecorder] Guild ID:', recordingInfo.guildId);
            const guildConfig = this.configService.getGuildConfig(recordingInfo.guildId);
            this.logger.info('[VoiceRecorder] Summary Channel ID:', guildConfig?.summaryChannelId);
            this.logger.info('[VoiceRecorder] Guild Config:', JSON.stringify(guildConfig, null, 2));

            await this.sendSummaryToChannel(recordingInfo.guildId, summary, recordingInfo.startTime, isTranscription, jobId);

            this.events.emit(RecordingEvents.RECORDING_SUMMARIZED, {
                guildId: recordingInfo.guildId,
                summary,
                transcript,
                timestamp
            });
        } catch (error) {
            this.logger.error('[VoiceRecorder] Error in transcription/summarization:', error);
            throw error;
        }

        await this.cleanup(recordingInfo.guildId, false); 
        return mp3File;
    }
} 
