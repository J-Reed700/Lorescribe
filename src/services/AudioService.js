import fs from 'node:fs';
import fsSync from 'node:fs';
import { spawn } from 'node:child_process';
import { EndBehaviorType } from '@discordjs/voice';
import prism from 'prism-media';
import logger from '../utils/logger.js';

export default class AudioService {
    constructor(voiceState, storage, logger, client) {
        this.voiceState = voiceState;
        this.storage = storage;
        this.logger = logger;
        this.client = client;
        this.players = new Map();
    }

    async convertToMp3(inputFile) {
        try {
            // Check if input file exists and has content
            const stats = await fs.promises.stat(inputFile);
            if (stats.size === 0) {
                throw new Error('Input file is empty');
            }

            // Wait a bit to ensure all writes are complete
            await new Promise(resolve => setTimeout(resolve, 1000));

            const outputFile = inputFile + '.mp3';
            
            // Ensure the input file still exists before starting conversion
            if (!fsSync.existsSync(inputFile)) {
                throw new Error(`Input file was deleted before conversion: ${inputFile}`);
            }

            return new Promise((resolve, reject) => {
                const ffmpeg = spawn('ffmpeg', [
                    '-f', 's16le',        // Input format (PCM 16-bit little-endian)
                    '-ar', '48000',       // Sample rate
                    '-ac', '2',           // Number of channels
                    '-i', inputFile,      // Input file
                    '-codec:a', 'libmp3lame',  // MP3 codec
                    '-q:a', '2',          // Quality (2 is high quality, lower number = higher quality)
                    '-y',                 // Overwrite output file
                    outputFile            // Output file
                ]);

                let ffmpegLogs = '';
                let stdoutLogs = '';

                ffmpeg.stderr.on('data', (data) => {
                    ffmpegLogs += data.toString();
                });

                ffmpeg.stdout.on('data', (data) => {
                    stdoutLogs += data.toString();
                });

                ffmpeg.on('close', async (code) => {
                    if (code === 0) {
                        // Verify the output file exists and has content
                        try {
                            const outStats = await fs.promises.stat(outputFile);
                            if (outStats.size === 0) {
                                logger.error('FFmpeg produced empty output file:', {
                                    inputFile,
                                    outputFile,
                                    inputSize: stats.size,
                                    logs: ffmpegLogs
                                });
                                reject(new Error('FFmpeg produced empty output file'));
                                return;
                            }
                            logger.info(`Successfully converted ${inputFile} to MP3`);
                            resolve(outputFile);
                        } catch (err) {
                            logger.error('Error verifying output file:', err);
                            reject(err);
                        }
                    } else {
                        logger.error('FFmpeg conversion failed:', {
                            inputFile,
                            outputFile,
                            exitCode: code,
                            stderr: ffmpegLogs,
                            stdout: stdoutLogs,
                            inputFileExists: fsSync.existsSync(inputFile),
                            inputFileSize: stats.size
                        });
                        reject(new Error(`FFmpeg conversion failed with code ${code}`));
                    }
                });

                ffmpeg.on('error', (err) => {
                    logger.error('FFmpeg process error:', {
                        error: err,
                        inputFile,
                        outputFile,
                        inputFileExists: fsSync.existsSync(inputFile),
                        inputFileSize: stats.size
                    });
                    reject(err);
                });
            });
        } catch (error) {
            logger.error('Error in convertToMp3:', {
                error,
                inputFile,
                inputFileExists: fsSync.existsSync(inputFile)
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
} 