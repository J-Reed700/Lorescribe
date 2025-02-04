import fs from 'node:fs';
import { spawn } from 'node:child_process';
import prism from 'prism-media';
import logger from '../utils/logger.js';
import config from '../config.js';

export default class AudioService {
  constructor(voiceState, storage, logger, client, events) {
    this.voiceState = voiceState;
    this.storage = storage;
    this.logger = logger;
    this.client = client;
    this.events = events;
    this.config = config;
  }

  /**
   * Create a recording pipeline for a given user.
   * This method spawns an FFmpeg process that reads raw PCM data from stdin
   * and encodes it to MP3 on the fly. A unique filename is generated based on
   * the guild and user IDs.
   */
  async createUserRecordingPipeline(guildId, userId) {
    // Generate a filename that is unique per user
    const filename = this.storage.getTempFilePath(`${guildId}-${userId}`, 'mp3');
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-f', 's16le',
      '-ar', String(this.config.VOICE.SAMPLE_RATE),
      '-ac', String(this.config.VOICE.CHANNELS),
      '-acodec', 'pcm_s16le',
      '-i', 'pipe:0',
      '-codec:a', 'libmp3lame',
      '-q:a', String(this.config.OUTPUT.QUALITY),
      '-b:a', this.config.OUTPUT.BITRATE,
      '-y',
      filename
    ]);

    // Log FFmpeg output for debugging.
    ffmpeg.stderr.on('data', (data) => {
      this.logger.info(`[AudioService][User ${userId}] ffmpeg: ${data.toString()}`);
    });

    const outputStream = ffmpeg.stdin;
    const opusDecoder = await this.createOpusDecoder();

    return { outputStream, opusDecoder, filename, ffmpegProcess: ffmpeg };
  }

  async createOpusDecoder() {
    let opusDecoder;
    try {
      const decoder = new prism.opus.Decoder({
        rate: this.config.VOICE.SAMPLE_RATE,
        channels: this.config.VOICE.CHANNELS,
        frameSize: 480 // 20ms frames at the configured sample rate
      });
      opusDecoder = decoder;
      this.logger.info('[AudioService] Using prism-media opus decoder');
    } catch (e) {
      try {
        const { default: OpusScript } = await import('opusscript');
        opusDecoder = new OpusScript(this.config.VOICE.SAMPLE_RATE, this.config.VOICE.CHANNELS);
        this.logger.info('[AudioService] Using opusscript decoder');
      } catch (e) {
        try {
          const { default: NodeOpus } = await import('node-opus');
          opusDecoder = new NodeOpus.OpusDecoder(this.config.VOICE.SAMPLE_RATE, this.config.VOICE.CHANNELS);
          this.logger.info('[AudioService] Using node-opus decoder');
        } catch (e) {
          try {
            const { OpusDecoder } = await import('@discordjs/opus');
            opusDecoder = new OpusDecoder(this.config.VOICE.SAMPLE_RATE, this.config.VOICE.CHANNELS);
            this.logger.info('[AudioService] Using @discordjs/opus decoder');
          } catch (e) {
            this.logger.error('[AudioService] Failed to load any opus decoder:', e);
            throw new Error('No opus decoder available. Please install either opusscript, node-opus, or @discordjs/opus');
          }
        }
      }
    }
    return opusDecoder;
  }

  /**
   * Start recording for an individual user.
   * Returns an object representing that user’s recording pipeline.
   */
  async startUserRecording(userId, connection) {
    const pipeline = await this.createUserRecordingPipeline(connection.joinedGuild.id, userId);
    const userRecording = {
      userId,
      ...pipeline,
      dataReceived: false,
      bytesWritten: 0,
      startTime: Date.now()
    };
    return userRecording;
  }

  /**
   * Close a given user recording pipeline.
   */
  async closeUserRecording(recording) {
    return new Promise((resolve, reject) => {
      try {
        if (recording.opusDecoder) {
          recording.opusDecoder.unpipe();
          recording.opusDecoder.destroy();
        }
        if (recording.outputStream) {
          let streamClosed = false;
          const timeout = setTimeout(() => {
            if (!streamClosed) {
              this.logger.warn(`[AudioService][User ${recording.userId}] Output stream close timed out, forcing destruction`);
              recording.outputStream.destroy();
              resolve();
            }
          }, 5000);
          const cleanup = () => {
            if (!streamClosed) {
              streamClosed = true;
              clearTimeout(timeout);
              this.logger.info(`[AudioService][User ${recording.userId}] Output stream closed successfully`);
              resolve();
            }
          };
          recording.outputStream.once('end', cleanup);
          recording.outputStream.once('close', cleanup);
          recording.outputStream.once('error', (error) => {
            if (!streamClosed) {
              streamClosed = true;
              clearTimeout(timeout);
              this.logger.error(`[AudioService][User ${recording.userId}] Output stream error during close:`, error);
              recording.outputStream.destroy();
              resolve();
            }
          });
          recording.outputStream.end();
        } else {
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    });
  }
}
