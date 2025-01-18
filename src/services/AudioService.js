const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsSync = require('fs');
const logger = require('../utils/logger');
const prism = require('prism-media');
const { EndBehaviorType } = require('@discordjs/voice');
const RecordingEvents = require('../events/RecordingEvents');

class AudioService {
    constructor(voiceState, storage, logger) {
        this.voiceState = voiceState;
        this.storage = storage;
        this.logger = logger;
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
                            logger.debug(`Successfully converted ${inputFile} to MP3`);
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
            this.logger.debug('[VoiceRecorder] Using prism-media opus decoder');
        } catch (e) {
            try {
                const OpusScript = require('opusscript');
                opusDecoder = new OpusScript(48000, 2);
                this.logger.debug('[VoiceRecorder] Using opusscript decoder');
            } catch (e) {
                try {
                    const NodeOpus = require('node-opus');
                    opusDecoder = new NodeOpus.OpusDecoder(48000, 2);
                    this.logger.debug('[VoiceRecorder] Using node-opus decoder');
                } catch (e) {
                    try {
                        const { OpusDecoder } = require('@discordjs/opus');
                        opusDecoder = new OpusDecoder(48000, 2);
                        this.logger.debug('[VoiceRecorder] Using @discordjs/opus decoder');
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

        // Clean up any existing listeners
        receiver.speaking.removeAllListeners();

        this.logger.debug(`[VoiceRecorder] Voice receiver state:`, {
            speaking: receiver.speaking,
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
            this.logger.error('[VoiceRecorder] Opus decoder error:', error);
        });

        outputStream.on('error', error => {
            this.logger.error('[VoiceRecorder] Output stream error:', error);
        });

        // Monitor speaking states and create audio subscriptions
        receiver.speaking.on('start', (userId) => {
            // Only handle if we don't already have a subscription for this user
            if (!recordingInfo.audioStreams.has(userId)) {
                recordingInfo.speakingStates.set(userId, true);
                this.logger.debug(`[VoiceRecorder] User ${userId} started speaking`);
                
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
                        this.logger.debug(`[VoiceRecorder] Received audio data from ${userId}: ${data.length} bytes`);
                    }
                });

                audioStream.on('error', error => {
                    if (!error.message.includes('Premature close')) {
                        this.logger.error(`[VoiceRecorder] Audio stream error for ${userId}:`, error);
                    }
                });

                audioStream
                    .pipe(opusDecoder)
                    .pipe(outputStream);
                recordingInfo.audioStreams.set(userId, audioStream);
            }
        });

        receiver.speaking.on('end', (userId) => {
            if (recordingInfo.speakingStates.get(userId)) {
                recordingInfo.speakingStates.set(userId, false);
                this.logger.debug(`[VoiceRecorder] User ${userId} stopped speaking`);
            }
        });

        return recordingInfo;
    }
}


module.exports = AudioService; 