import { EventEmitter } from 'events';
import fs from 'node:fs';
import logger from './utils/logger.js';
import RecordingEvents from './events/RecordingEvents.js';
import baseConfig from './config.js';


export class Transummarize {
    constructor(summary, transcript, timestamp, isTranscription, jobId, isUnableToSummarize) {
        this.summary = summary;
        this.transcript = transcript;
        this.timestamp = timestamp;
        this.isTranscription = isTranscription;
        this.jobId = jobId;
        this.isUnableToSummarize = isUnableToSummarize;
    }
}

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

        let newRecordingInfo = null;
        const connection = recordingInfo.connection;

        try {
            // Create new recording components first
            const { outputStream, opusDecoder, filename } = await this.audioService.createStreamAndOpusDecoder(guildId);
            
            // Set up new recording but don't activate it yet
            newRecordingInfo = await this.audioService.StartRecording(connection, opusDecoder, outputStream);
            newRecordingInfo.filename = filename;

            // Wait a moment to ensure any pending writes complete
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Process the current recording
            try {
                await this.processRotatedRecording(recordingInfo, guildId);
            } catch (error) {
                this.logger.error('[VoiceRecorder] Error processing rotated recording:', error);
                this.events.emit(RecordingEvents.ROTATION_ERROR, { guildId, error });
            }

            // Now that we have both recordings ready, perform the swap
            this.activeRecordings.set(guildId, newRecordingInfo);

            this.logger.info(`[VoiceRecorder] Successfully rotated recording for guild ${guildId}`);

        } catch (error) {
            this.logger.error('[VoiceRecorder] Error rotating files:', error);
            
            // If we failed to create the new recording but haven't swapped yet, 
            // keep the old one active
            if (newRecordingInfo === null) {
                this.logger.info('[VoiceRecorder] Keeping existing recording active after rotation failure');
            } else {
                // If we have a new recording but failed during swap,
                // try to clean it up
                await this.closeStreams(newRecordingInfo).catch(cleanupError => {
                    this.logger.error('[VoiceRecorder] Error cleaning up failed new recording:', cleanupError);
                });
            }

            this.events.emit(RecordingEvents.ROTATION_ERROR, { guildId, error });
            // Don't throw the error - we want to keep recording even if rotation fails
            this.logger.warn('[VoiceRecorder] Continuing despite rotation error');
        }
    }

    async processRotatedRecording(recordingInfo, guildId) {
        try {
            const fileName = recordingInfo.filename;
            await this.closeStreams(recordingInfo);
            
            // Wait for file to be fully written
            await new Promise(resolve => setTimeout(resolve, baseConfig.ROTATION_DELAY));
            
            // Get file stats before processing
            const stats = await fs.promises.stat(fileName);
            
            // Check if file is empty or too small
            if (stats.size < 1000) { // Less than 1KB
                this.logger.warn('[VoiceRecorder] Recording file too small, skipping processing:', {
                    size: stats.size,
                    filename: recordingInfo.filename
                });
       
                
                await this.storage.deleteFile(recordingInfo.filename);
                return;
            }
            
            // Now that streams are cleaned up, process the recording
            const mp3File = await this.audioService.convertToMp3(recordingInfo.filename);

            const transummarize = await this.TrascribeAndSummarize(recordingInfo, guildId, mp3File);
            await this.sendSummaryToChannel(guildId, transummarize);

            const {summary, transcript, timestamp} = transummarize;

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
            // Don't rethrow - we want to continue recording even if processing fails
            if(recordingInfo && recordingInfo.filename) {
                await this.storage.deleteFile(recordingInfo.filename).catch(() => {});
            }
        }
    }

    async TrascribeAndSummarize(recordingInfo, guildId, mp3File) {
        let isTranscription = false;
        let jobId = null;
        let isUnableToSummarize = false;
        const stats = await fs.promises.stat(recordingInfo.filename);

        if (stats.size === 0) {
            this.logger.warn('[VoiceRecorder] Skipping empty recording file');
            await this.storage.deleteFile(recordingInfo.filename);
            return { 
                summary: 'Recording was empty - no audio detected.',
                transcript: '',
                timestamp: Date.now(),
                isTranscription: false,
                jobId: null
            };
        }

        try {
            // Process transcription and summary
            let transcript;
            try {
                transcript = await this.transcriptionService.transcribeAudio(mp3File, guildId);
                this.logger.info(`[VoiceRecorder] Transcript received for guild ${guildId}: ${transcript.substring(0, 200)}...`);
            } catch (transcriptionError) {
                if (transcriptionError.message === 'Audio file too small for transcription') {
                    return {
                        summary: 'Recording was too short for transcription.',
                        transcript: '',
                        timestamp: Date.now(),
                        isTranscription: false,
                        jobId: null
                    };
                }
                throw transcriptionError;
            }
            
            let summary = transcript;
            try {
                const result = await this.transcriptionService.generateSummary(transcript, guildId);
                summary = result.summary;
                isTranscription = result.isTranscription;
                isUnableToSummarize = result.isUnableToSummarize;
            } catch (summaryError) {
                this.logger.warn(`[VoiceRecorder] Failed to generate summary, using transcript as fallback:`, summaryError);
                isTranscription = true;
            }

            if (!isUnableToSummarize) {
                // Schedule background summary generation
                jobId = await this.summaryJobs.scheduleSummaryGeneration(guildId, transcript, baseConfig.JOB_DELAY);
                this.logger.info(`[VoiceRecorder] Scheduled summary generation for guild ${guildId} with job ID: ${jobId}`);
            }

            // Save transcript
            const timestamp = Date.now();
            await this.storage.saveTranscript(guildId, transcript, timestamp);

            return new Transummarize(summary, transcript, timestamp, isTranscription, jobId, isUnableToSummarize);
        } catch (error) {
            this.logger.error('[VoiceRecorder] Error transcribing or saving transcript:', {
                error: error.message,
                stack: error.stack,
                guildId,
                fileSize: stats.size
            });
            
            // Return a user-friendly error message
            return {
                summary: 'Failed to process recording. Please try again or contact support if the issue persists.',
                transcript: '',
                timestamp: Date.now(),
                isTranscription: false,
                jobId: null
            };
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
                    let streamClosed = false;

                    // Set a timeout in case the stream doesn't close
                    const timeout = setTimeout(() => {
                        if (!streamClosed) {
                            this.logger.warn('[VoiceRecorder] Output stream close timed out, forcing destruction');
                            recordingInfo.outputStream.destroy();
                            resolve();
                        }
                    }, 5000);

                    // Listen for both 'end' and 'close' events
                    const cleanup = () => {
                        if (!streamClosed) {
                            streamClosed = true;
                            clearTimeout(timeout);
                            this.logger.info('[VoiceRecorder] Output stream closed successfully');
                            resolve();
                        } 
                    };

                    recordingInfo.outputStream.once('end', cleanup);
                    recordingInfo.outputStream.once('close', cleanup);
                    recordingInfo.outputStream.once('error', (error) => {
                        if (!streamClosed) {
                            streamClosed = true;
                            clearTimeout(timeout);
                            this.logger.error('[VoiceRecorder] Output stream error during close:', error);
                            recordingInfo.outputStream.destroy();
                            resolve();
                        }
                    });

                    // Initiate the graceful close
                    recordingInfo.outputStream.end();
                } else {
                    resolve();
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    async sendSummaryToChannel(guildId, transummarize) {
        if (!guildId) return;

        const guildConfig = this.configService.getGuildConfig(guildId);
        await this.channelService.sendErrorMessage(guildConfig, transummarize);
    }

    async startRecording(voiceChannel) {

        const guildId = voiceChannel.guild.id;
        const interval = await this.configService.getTimeInterval(guildId);
        
        if(!this.configService.getOpenAIKey(guildId)) {
            throw new Error('OpenAI API key not set');
        }

        if(this.configService.getGuildConfig(guildId)?.summaryChannelId === null) {
            throw new Error('Summary channel not set');
        }

        if (this.activeRecordings.has(guildId)) {

            throw new Error('Recording already in progress');
        }

        try {
            // Join the voice channel
            const connection = await this.voiceState.joinChannel(voiceChannel);
            this.logger.info(`[VoiceRecorder] Joined voice channel for guild ${guildId}`);
            if (!connection) {
                throw new Error('Failed to establish voice connection');
            }
            
            this.logger.info(`[VoiceRecorder] Joined voice channel for guild ${guildId}`);
            // Create the recording session
            const { outputStream, opusDecoder, filename } = await this.audioService.createStreamAndOpusDecoder(guildId);

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

            const mp3File = await this.ClearStreamsAndSave(recordingInfo, guildId);
            const stats = await fs.promises.stat(recordingInfo.filename);

            this.events.emit(RecordingEvents.RECORDING_STOPPED, { 
                guildId,
                outputFile: mp3File,
                size: stats.size,
                duration: Date.now() - recordingInfo.startTime
            });

            await this.storage.deleteFile(recordingInfo.filename);
            await this.storage.deleteFile(mp3File);
        } catch (error) {
            this.logger.error(`[VoiceRecorder] Error stopping recording:`, error);
            // Don't delete files on error so we can debug
            await this.cleanup(guildId);
            throw error;
        }
    }

    async cleanup(guildId) {           
        // Leave the voice channel
        await this.voiceState.leaveChannel(guildId);
        const recordingInfo = this.activeRecordings.get(guildId);

        if (!recordingInfo) return;

        try {
            await this.closeStreams(recordingInfo);
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

    async ClearStreamsAndSave(recordingInfo, guildId) {
        // Check if we received any data
        await this.closeStreams(recordingInfo);

        // Wait a bit to ensure all data is written
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (!fs.existsSync(recordingInfo.filename)) {
            this.logger.error('[VoiceRecorder] Recording file does not exist');
            return;
        }
        
        let mp3File;
        try {   
            // Now that streams are cleaned up, process the recording
            mp3File = await this.audioService.convertToMp3(recordingInfo.filename);

            const transummarize = await this.TrascribeAndSummarize(recordingInfo, guildId, mp3File);
            await this.sendSummaryToChannel(guildId, transummarize);

            const {summary, transcript, timestamp} = transummarize;
            this.events.emit(RecordingEvents.RECORDING_SUMMARIZED, {
                guildId: recordingInfo.guildId,
                summary,
                transcript,
                timestamp
            });
        } catch (error) {
            this.logger.error('[VoiceRecorder] Error in transcription/summarization:', error);
            throw error;
        } finally {
            await this.cleanup(recordingInfo.guildId);
        }

        return mp3File;
    }

} 
