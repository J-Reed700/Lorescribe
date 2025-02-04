import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { EndBehaviorType } from '@discordjs/voice';
import prism from 'prism-media';
import logger from '../utils/logger.js';
import RecordingEvents from '../events/RecordingEvents.js';
import config from '../config.js';
// Optionally, import pipeline utilities if you want to use them:
// import { pipeline } from 'stream/promises';

export default class AudioService {
  constructor(voiceState, storage, logger, client, events) {
    this.voiceState = voiceState;
    this.storage = storage;
    this.logger = logger;
    this.client = client;
    this.events = events;
    this.players = new Map();
    this.activeConnections = new Map();
    this.config = config;
  }

  /**
   * Create a recording pipeline that decodes opus audio and pipes the PCM data
   * into FFmpeg so that it is encoded directly to MP3.
   */
  async createStreamAndOpusDecoder(guildId) {
    // Create a temporary filename that will be our final MP3 file
    const filename = this.storage.getTempFilePath(guildId, 'mp3');

    // Spawn FFmpeg to encode PCM (from stdin) to MP3 directly.
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-f', 's16le',
      '-ar', String(this.config.VOICE.SAMPLE_RATE),
      '-ac', String(this.config.VOICE.CHANNELS),
      '-acodec', 'pcm_s16le',
      '-i', 'pipe:0', // Read PCM data from standard input
      '-codec:a', 'libmp3lame',
      '-q:a', String(this.config.OUTPUT.QUALITY),
      '-b:a', this.config.OUTPUT.BITRATE,
      '-y', // Overwrite output if necessary
      filename
    ]);

    // Log FFmpeg output for debugging
    ffmpeg.stderr.on('data', (data) => {
      this.logger.info(`[AudioService] ffmpeg: ${data.toString()}`);
    });

    // FFmpeg’s stdin will be our “output” stream that receives PCM data.
    const outputStream = ffmpeg.stdin;

    // Create (or try) an opus decoder
    const opusDecoder = await this.createOpusDecoder();

    // Return all recording pipeline components (including the FFmpeg process)
    return { outputStream, opusDecoder, filename, ffmpegProcess: ffmpeg };
  }

  async createOpusDecoder() {
    let opusDecoder;
    try {
      const decoder = new prism.opus.Decoder({
        rate: this.config.VOICE.SAMPLE_RATE,
        channels: this.config.VOICE.CHANNELS,
        frameSize: 480 // For a 20ms frame at a given sample rate
      });
      opusDecoder = decoder;
      this.logger.info('[VoiceRecorder] Using prism-media opus decoder');
    } catch (e) {
      try {
        const { default: OpusScript } = await import('opusscript');
        opusDecoder = new OpusScript(this.config.VOICE.SAMPLE_RATE, this.config.VOICE.CHANNELS);
        this.logger.info('[VoiceRecorder] Using opusscript decoder');
      } catch (e) {
        try {
          const { default: NodeOpus } = await import('node-opus');
          opusDecoder = new NodeOpus.OpusDecoder(this.config.VOICE.SAMPLE_RATE, this.config.VOICE.CHANNELS);
          this.logger.info('[VoiceRecorder] Using node-opus decoder');
        } catch (e) {
          try {
            const { OpusDecoder } = await import('@discordjs/opus');
            opusDecoder = new OpusDecoder(this.config.VOICE.SAMPLE_RATE, this.config.VOICE.CHANNELS);
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

  /**
   * This method is now kept for backwards compatibility. When using the on‑the‑fly
   * encoding pipeline, the file is already MP3.
   */
  async convertToMp3(inputFile) {
    // (The implementation remains similar to your original version.)
    try {
      const stats = await fs.promises.stat(inputFile);
      if (stats.size === 0) {
        throw new Error('Input file is empty');
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      const outputFile = inputFile.endsWith('.mp3') ? inputFile : inputFile + '.mp3';

      const inputExists = await fs.promises.access(inputFile, fs.constants.F_OK).then(() => true).catch(() => false);
      if (!inputExists) {
        throw new Error(`Input file was deleted before conversion: ${inputFile}`);
      }

      return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-hide_banner',
          '-f', 's16le',
          '-ar', String(this.config.VOICE.SAMPLE_RATE),
          '-ac', String(this.config.VOICE.CHANNELS),
          '-acodec', 'pcm_s16le',
          '-i', inputFile,
          '-codec:a', 'libmp3lame',
          '-q:a', String(this.config.OUTPUT.QUALITY),
          '-b:a', this.config.OUTPUT.BITRATE,
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

        ffmpeg.on('close', async (code) => {
          if (code === 0) {
            let outputExists = await fs.promises.stat(outputFile).then(() => true).catch(() => false);
            if (!outputExists) {
              logger.error('FFmpeg produced no output file:', { inputFile, outputFile });
              reject(new Error('FFmpeg produced no output file'));
              return;
            }
            const outStats = await fs.promises.stat(outputFile);
            if (outStats.size === 0) {
              logger.error('FFmpeg produced empty output file:', { inputFile, outputFile, inputSize: stats.size, logs: { stderr: stderrLogs, stdout: stdoutLogs } });
              reject(new Error('FFmpeg produced empty output file'));
              return;
            }
            logger.info(`Successfully converted ${inputFile} to MP3`);
            resolve(outputFile);
          } else {
            logger.error('FFmpeg conversion failed:', { inputFile, outputFile, exitCode: code, stderr: stderrLogs, stdout: stdoutLogs });
            reject(new Error(`FFmpeg conversion failed with code ${code}`));
          }
        });

        ffmpeg.on('error', (err) => {
          logger.error('FFmpeg process error:', { error: err.message, inputFile, outputFile });
          reject(err);
        });
      });
    } catch (error) {
      logger.error('Error in convertToMp3:', { error: error.message, inputFile, inputFileExists: fs.existsSync(inputFile) });
      throw error;
    }
  }

  async StartRecording(connection, opusDecoder, outputStream) {
    const receiver = connection.receiver;
    if (!receiver) {
      throw new Error('No voice receiver available');
    }

    this.logger.info(`[AudioService] Starting recording with connection state:`, {
      status: connection.state.status,
      adapter: connection.state.adapter ? 'present' : 'missing',
      subscription: connection.state.subscription ? 'active' : 'inactive'
    });

    // Create a recording info object that tracks the recording state.
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

    // Attach error listeners to the decoder and output stream.
    opusDecoder.on('error', error => {
      this.logger.error('[AudioService] Opus decoder error:', error);
    });
    outputStream.on('error', error => {
      this.logger.error('[AudioService] Output stream error:', error);
    });

    // Log connection state changes.
    connection.on('stateChange', (oldState, newState) => {
      this.logger.info(`[AudioService] Voice connection state changed from ${oldState.status} to ${newState.status}`);
    });

    // When a user starts speaking, subscribe to their audio stream.
    receiver.speaking.on('start', async (userId) => {
      if (!recordingInfo.audioStreams.has(userId)) {
        try {
          // (For multiple-user separation, you could create separate pipelines here.)
          const user = await this.client.users.fetch(userId);
          if (user.bot) {
            this.logger.info(`[AudioService] Ignoring bot user ${userId}`);
            return;
          }
          recordingInfo.speakingStates.set(userId, true);
          this.logger.info(`[AudioService] User ${userId} started speaking`);

          const audioStream = receiver.subscribe(userId, {
            end: { behavior: EndBehaviorType.Manual }
          });

          let count = 0;
          audioStream.on('data', (data) => {
            count++;
            recordingInfo.dataReceived = true;
            recordingInfo.lastDataTime = Date.now();
            recordingInfo.bytesWritten += data.length;
            if (count % 100 === 0) {
              this.logger.info(`[AudioService] Received audio data from ${userId}: ${data.length} bytes (total: ${recordingInfo.bytesWritten} bytes)`);
            }
          });
          audioStream.on('error', error => {
            if (!error.message.includes('Premature close')) {
              this.logger.error(`[AudioService] Audio stream error for ${userId}:`, error);
            }
          });

          // Pipe this user’s audio stream into the common pipeline.
          // (For a per‑user file, you would create a separate pipeline here.)
          audioStream
            .pipe(opusDecoder, { end: false })
            .pipe(outputStream, { end: false });

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

  async cleanup(guildId) {
    const cleanupStatus = {
      guildId,
      success: false,
      details: { audioStreams: false, opusDecoder: false, outputStream: false, connection: false },
      errors: []
    };

    try {
      // Cleanup the voice connection.
      const connection = this.activeConnections.get(guildId);
      if (connection) {
        try {
          connection.destroy();
          this.activeConnections.delete(guildId);
          cleanupStatus.details.connection = true;
        } catch (error) {
          cleanupStatus.errors.push({ component: 'connection', error: error.message });
        }
      }

      // Cleanup streams and decoders.
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
            cleanupStatus.errors.push({ component: 'audioStreams', error: error.message });
          }
        }
        if (recordingInfo.opusDecoder) {
          try {
            recordingInfo.opusDecoder.unpipe();
            recordingInfo.opusDecoder.destroy();
            cleanupStatus.details.opusDecoder = true;
          } catch (error) {
            cleanupStatus.errors.push({ component: 'opusDecoder', error: error.message });
          }
        }
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
            cleanupStatus.errors.push({ component: 'outputStream', error: error.message });
          }
        }
        this.recordings.delete(guildId);
      }
      cleanupStatus.success = cleanupStatus.errors.length === 0;
    } catch (error) {
      cleanupStatus.errors.push({ component: 'general', error: error.message });
    }

    if (this.events) {
      this.events.emit(RecordingEvents.CLEANUP_COMPLETED, cleanupStatus);
    }
    return cleanupStatus;
  }
}
