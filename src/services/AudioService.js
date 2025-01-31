import fs from 'node:fs';
import fsSync from 'node:fs';
import { spawn } from 'node:child_process';
import { EndBehaviorType } from '@discordjs/voice';
import prism from 'prism-media';
import logger from '../utils/logger.js';
import RecordingEvents from '../events/RecordingEvents.js';

export default class AudioService {
    constructor(voiceState, storage, logger, client, events) {
        this.voiceState = voiceState;
        this.storage = storage;
        this.logger = logger;
        this.client = client;
        this.events = events;
        this.players = new Map();
        this.activeConnections = new Map();

        // Add cleanup verification
        if (this.events) {
            this.events.on(RecordingEvents.CLEANUP_COMPLETED, (status) => {
                if (!status.success) {
                    this.logger.error(`[AudioService] Cleanup failed for guild ${status.guildId}:`, {
                        details: status.details,
                        errors: status.errors
                    });
                    return;
                }

                // Verify all resources were properly cleaned up
                const allResourcesCleaned = Object.values(status.details).every(value => value === true);
                
                if (!allResourcesCleaned) {
                    this.logger.warn(`[AudioService] Some resources may not have been properly cleaned up:`, status.details);
                } else {
                    this.logger.info(`[AudioService] All resources successfully cleaned up for guild ${status.guildId}`);
                }
            });
        }
    }

    async convertToMp3(inputFile) {
        try {
            const stats = await fs.promises.stat(inputFile);
            if (stats.size === 0) {
                throw new Error('Input file is empty');
            }

            await new Promise(resolve => setTimeout(resolve, 1000));

            const outputFile = inputFile + '.mp3';

            // Use asynchronous file check
            const inputExists = await fs.promises.access(inputFile, fs.constants.F_OK).then(() => true).catch(() => false);
            if (!inputExists) {
                throw new Error(`Input file was deleted before conversion: ${inputFile}`);
            }

            return new Promise((resolve, reject) => {
                const ffmpeg = spawn('ffmpeg', [
                    '-hide_banner',
                    '-f', 's16le',
                    '-ar', '48000',
                    '-ac', '2',
                    '-acodec', 'pcm_s16le',
                    '-i', inputFile,
                    '-codec:a', 'libmp3lame',
                    '-q:a', '2',
                    '-y',
                    outputFile
                ]);

                let stderrLogs = '';
                let stdoutLogs = '';

                ffmpeg.stderr.on('data', (data) => {
                    stderrLogs += data.toString();
                });

                ffmpeg.stdout.on('data', (data) => {
                    stdoutLogs += data.toString();
                });

                const checkFileExistence = async () => {
                    try {
                        await fs.promises.stat(outputFile);
                        return true;
                    } catch (error) {
                        return false;
                    }
                };

                ffmpeg.on('close', async (code) => {
                    if (code === 0) {
                        let outputExists = await checkFileExistence();
                        if (!outputExists) {
                            logger.error('FFmpeg produced no output file:', {
                                inputFile,
                                outputFile
                            });
                            reject(new Error('FFmpeg produced no output file'));
                            return;
                        }

                        const outStats = await fs.promises.stat(outputFile);
                        if (outStats.size === 0) {
                            logger.error('FFmpeg produced empty output file:', {
                                inputFile,
                                outputFile,
                                inputSize: stats.size,
                                logs: { stderr: stderrLogs, stdout: stdoutLogs }
                            });
                            reject(new Error('FFmpeg produced empty output file'));
                            return;
                        }

                        logger.info(`Successfully converted ${inputFile} to MP3`);
                        resolve(outputFile);
                    } else {
                        logger.error('FFmpeg conversion failed:', {
                            inputFile,
                            outputFile,
                            exitCode: code,
                            stderr: stderrLogs,
                            stdout: stdoutLogs
                        });
                        reject(new Error(`FFmpeg conversion failed with code ${code}`));
                    }
                });

                ffmpeg.on('error', (err) => {
                    logger.error('FFmpeg process error:', {
                        error: err.message,
                        inputFile,
                        outputFile,
                        inputFileExists: inputExists,
                        inputFileSize: stats.size
                    });
                    reject(err);
                });
            });
        } catch (error) {
            logger.error('Error in convertToMp3:', {
                error: error.message,
                inputFile,
                inputFileExists: fs.existsSync(inputFile)
            });
            throw error;
        }
    }
    
    async createOpusDecoder() {
        let opusDecoder;
        try {
            const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
            opusDecoder = decoder;
            this.logger.info('[VoiceRecorder] Using prism-media opus decoder');
        } catch (e) {
            try {
                const { default: OpusScript } = await import('opusscript');
                opusDecoder = new OpusScript(48000, 2);
                this.logger.info('[VoiceRecorder] Using opusscript decoder');
            } catch (e) {
                try {
                    const { default: NodeOpus } = await import('node-opus');
                    opusDecoder = new NodeOpus.OpusDecoder(48000, 2);
                    this.logger.info('[VoiceRecorder] Using node-opus decoder');
                } catch (e) {
                    try {
                        const { OpusDecoder } = await import('@discordjs/opus');
                        opusDecoder = new OpusDecoder(48000, 2);
                        this.logger.info('[VoiceRecorder] Using @discordjs/opus decoder');
                    } catch (e) {
                        this.logger.error('[VoiceRecorder] Failed to load any opus decoder:', e);
                        throw new Error('No opus decoder available. Please install either opusscript, node-opus, or @discordjs/opus');
                    }
                }
            }
        }
        return opusDecoder;
    }

    async StartRecording(connection, opusDecoder, outputStream) {
        const receiver = connection.receiver;

        if (!receiver) {
            throw new Error('No voice receiver available');
        }

        connection.removeAllListeners();

        // Add connection state logging
        this.logger.info(`[AudioService] Starting recording with connection state:`, {
            status: connection.state.status,
            adapter: connection.state.adapter ? 'present' : 'missing',
            subscription: connection.state.subscription ? 'active' : 'inactive'
        });

        this.logger.info(`[AudioService] Voice receiver state:`, {
            speaking: receiver.speaking.size,
            subscriptions: receiver.subscriptions.size
        });

        // Store recording info
        const recordingInfo = {
            connection,
            receiver,
            audioStreams: new Map(),
            opusDecoder,
            outputStream,
            startTime: Date.now(),
            dataReceived: false,
            bytesWritten: 0,
            speakingStates: new Map()
        };

        // Set up error handlers first
        opusDecoder.on('error', error => {
            this.logger.error('[AudioService] Opus decoder error:', error);
        });

        outputStream.on('error', error => {
            this.logger.error('[AudioService] Output stream error:', error);
        });


        // Monitor speaking states and create audio subscriptions
        receiver.speaking.on('start', async (userId) => {
            // Only handle if we don't already have a subscription for this user
            if (!recordingInfo.audioStreams.has(userId)) {
                try {
                    // Fetch user to check if they are a bot
                    const user = await this.client.users.fetch(userId);
                    if (user.bot) {
                        this.logger.info(`[AudioService] Ignoring bot user ${userId}`);
                        return;
                    }

                    recordingInfo.speakingStates.set(userId, true);
                    this.logger.info(`[AudioService] User ${userId} started speaking`);
                    
                    const audioStream = receiver.subscribe(userId, {
                        end: {
                            behavior: EndBehaviorType.Manual
                        },
                    });

                    let count = 0;
                    audioStream.on('data', (data) => {
                        count++;
                        recordingInfo.dataReceived = true;
                        recordingInfo.lastDataTime = Date.now();
                        recordingInfo.bytesWritten += data.length;
                        if(count % 100 === 0) {
                            this.logger.info(`[AudioService] Received audio data from ${userId}: ${data.length} bytes (total: ${recordingInfo.bytesWritten} bytes)`);
                        }
                    });

                    audioStream.on('error', error => {
                        if (!error.message.includes('Premature close')) {
                            this.logger.error(`[AudioService] Audio stream error for ${userId}:`, error);
                        }
                    });

                    audioStream
                        .pipe(opusDecoder)
                        .pipe(outputStream);
                    recordingInfo.audioStreams.set(userId, audioStream);
                    
                    this.logger.info(`[AudioService] Set up audio stream for user ${userId}`);
                } catch (error) {
                    this.logger.error(`[AudioService] Error checking user ${userId}:`, error);
                }
            }
        });

        receiver.speaking.on('end', (userId) => {
            if (recordingInfo.speakingStates.get(userId)) {
                recordingInfo.speakingStates.set(userId, false);
                this.logger.info(`[AudioService] User ${userId} stopped speaking`);
            }
        });

        this.logger.info(`[AudioService] Recording setup complete, waiting for audio...`);
        return recordingInfo;
    }

    async createStreamAndOpusDecoder(guildId) {
        const filename = this.storage.getTempFilePath(guildId, 'pcm');
        const outputStream = fs.createWriteStream(filename);
        const opusDecoder = await this.createOpusDecoder();
            
        if (!opusDecoder) {
            throw new Error('Failed to create opus decoder');
        }
        return { outputStream, opusDecoder, filename };
    }

    async cleanup(guildId) {
        const cleanupStatus = {
            guildId,
            success: false,
            details: {
                audioStreams: false,
                opusDecoder: false,
                outputStream: false,
                connection: false
            },
            errors: []
        };

        try {
            // Cleanup voice connection
            const connection = this.activeConnections.get(guildId);
            if (connection) {
                try {
                    connection.destroy();
                    this.activeConnections.delete(guildId);
                    cleanupStatus.details.connection = true;
                } catch (error) {
                    cleanupStatus.errors.push({
                        component: 'connection',
                        error: error.message
                    });
                }
            }

            // Cleanup audio streams
            const recordingInfo = this.recordings.get(guildId);
            if (recordingInfo) {
                if (recordingInfo.audioStreams) {
                    try {
                        for (const [userId, stream] of recordingInfo.audioStreams) {
                            stream.unpipe();
                            stream.destroy();
                        }
                        cleanupStatus.details.audioStreams = true;
                    } catch (error) {
                        cleanupStatus.errors.push({
                            component: 'audioStreams',
                            error: error.message
                        });
                    }
                }

                // Cleanup opus decoder
                if (recordingInfo.opusDecoder) {
                    try {
                        recordingInfo.opusDecoder.unpipe();
                        recordingInfo.opusDecoder.destroy();
                        cleanupStatus.details.opusDecoder = true;
                    } catch (error) {
                        cleanupStatus.errors.push({
                            component: 'opusDecoder',
                            error: error.message
                        });
                    }
                }

                // Cleanup output stream
                if (recordingInfo.outputStream) {
                    try {
                        await new Promise((resolve, reject) => {
                            const timeout = setTimeout(() => {
                                recordingInfo.outputStream.destroy();
                                resolve();
                            }, 5000);

                            recordingInfo.outputStream.once('finish', () => {
                                clearTimeout(timeout);
                                resolve();
                            });

                            recordingInfo.outputStream.once('error', (error) => {
                                clearTimeout(timeout);
                                reject(error);
                            });

                            recordingInfo.outputStream.end();
                        });
                        cleanupStatus.details.outputStream = true;
                    } catch (error) {
                        cleanupStatus.errors.push({
                            component: 'outputStream',
                            error: error.message
                        });
                    }
                }

                this.recordings.delete(guildId);
            }

            cleanupStatus.success = cleanupStatus.errors.length === 0;
        } catch (error) {
            cleanupStatus.errors.push({
                component: 'general',
                error: error.message
            });
        }

        // Emit cleanup status
        if (this.events) {
            this.events.emit(RecordingEvents.CLEANUP_COMPLETED, cleanupStatus);
        }

        return cleanupStatus;
    }
} 