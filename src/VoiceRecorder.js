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
    this.rotationLocks = new Map();

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
    if (this.rotationLocks.get(guildId)) {
      this.logger.info(`[VoiceRecorder] Rotation already in progress for guild ${guildId}, skipping...`);
      return;
    }
    const recordingInfo = this.activeRecordings.get(guildId);
    if (!recordingInfo) return;

    let newRecordingInfo = null;
    const connection = recordingInfo.connection;

    try {
      // Set a rotation lock so that concurrent rotations won’t conflict.
      this.rotationLocks.set(guildId, true);

      // Check file size – if it exceeds the limit, we will rotate.
      const stats = await fs.promises.stat(recordingInfo.filename);
      if (stats.size >= baseConfig.MAX_FILE_SIZE) {
        this.logger.info(`[VoiceRecorder] File size (${stats.size} bytes) exceeded limit (${baseConfig.MAX_FILE_SIZE} bytes), during rotation...`);
      }

      // Create a new recording pipeline (with on‑the‑fly MP3 encoding).
      const { outputStream, opusDecoder, filename, ffmpegProcess } = await this.audioService.createStreamAndOpusDecoder(guildId);
      newRecordingInfo = await this.audioService.StartRecording(connection, opusDecoder, outputStream);
      newRecordingInfo.filename = filename;
      newRecordingInfo.ffmpegProcess = ffmpegProcess;

      // Allow any pending writes to complete.
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Process the rotated (old) recording.
      try {
        await this.processRotatedRecording(recordingInfo, guildId);
      } catch (error) {
        this.logger.error('[VoiceRecorder] Error processing rotated recording:', error);
        this.events.emit(RecordingEvents.ROTATION_ERROR, { guildId, error });
      }

      // Swap the active recording with the new one.
      this.activeRecordings.set(guildId, newRecordingInfo);
      this.logger.info(`[VoiceRecorder] Successfully rotated recording for guild ${guildId}`);
    } catch (error) {
      this.logger.error('[VoiceRecorder] Error rotating files:', error);
      if (newRecordingInfo === null) {
        this.logger.info('[VoiceRecorder] Keeping existing recording active after rotation failure');
      } else {
        await this.closeStreams(newRecordingInfo).catch(cleanupError => {
          this.logger.error('[VoiceRecorder] Error cleaning up failed new recording:', cleanupError);
        });
      }
      this.events.emit(RecordingEvents.ROTATION_ERROR, { guildId, error });
      this.logger.warn('[VoiceRecorder] Continuing despite rotation error');
    } finally {
      this.rotationLocks.delete(guildId);
    }
  }

  async processRotatedRecording(recordingInfo, guildId) {
    try {
      const fileName = recordingInfo.filename;
      await this.closeStreams(recordingInfo);
      
      // Wait briefly for the file to be completely written.
      await new Promise(resolve => setTimeout(resolve, baseConfig.ROTATION_DELAY));
      
      // Check the file size; if too small, skip processing.
      const stats = await fs.promises.stat(fileName);
      if (stats.size < 1000) {
        this.logger.warn('[VoiceRecorder] Recording file too small, skipping processing:', {
          size: stats.size,
          filename: recordingInfo.filename
        });
        await this.storage.deleteFile(recordingInfo.filename);
        return;
      }
      
      // Since we now record directly in MP3 format, no conversion is needed.
      const mp3File = fileName;
      const transummarize = await this.TrascribeAndSummarize(recordingInfo, guildId, mp3File);
      await this.sendSummaryToChannel(guildId, transummarize);

      const { summary, transcript, timestamp } = transummarize;
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

      // Clean up the temporary file.
      await this.storage.deleteFile(recordingInfo.filename);
    } catch (error) {
      this.logger.error('[VoiceRecorder] Error processing recording:', error);
      if (recordingInfo && recordingInfo.filename) {
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

      if (isTranscription && !isUnableToSummarize) {
        jobId = await this.summaryJobs.scheduleSummaryGeneration(guildId, transcript, baseConfig.JOB_DELAY);
        this.logger.info(`[VoiceRecorder] Scheduled summary generation for guild ${guildId} with job ID: ${jobId}`);
      }

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
    return new Promise((resolve, reject) => {
      try {
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
        if (recordingInfo.outputStream) {
          let streamClosed = false;
          const timeout = setTimeout(() => {
            if (!streamClosed) {
              this.logger.warn('[VoiceRecorder] Output stream close timed out, forcing destruction');
              recordingInfo.outputStream.destroy();
              resolve();
            }
          }, 5000);
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
    try {
      const summaryChannelId = await this.configService.getSummaryChannel(guildId);
      if (!summaryChannelId) {
        this.logger.warn(`[VoiceRecorder] No summary channel configured for guild ${guildId}. Use /setsummarychannel to configure one.`);
        return;
      }
      await this.channelService.sendMessage(summaryChannelId, transummarize);
    } catch (error) {
      this.logger.error('[VoiceRecorder] Error sending to summary channel:', error);
    }
  }

  async startRecording(voiceChannel) {
    if (!voiceChannel) {
      throw new Error('No voice channel provided');
    }
    const guildId = voiceChannel.guild.id;

    try {
      await this.voiceState.joinChannel(voiceChannel);
      this.logger.info(`[VoiceRecorder] Joined voice channel for guild ${guildId}`);
      this.events.emit(RecordingEvents.JOINED_CHANNEL, { guildId });

      const connection = this.voiceState.getConnection(guildId);
      if (!connection) {
        throw new Error('No connection after joining channel');
      }

      // Create the recording pipeline (which now directly encodes to MP3).
      const { outputStream, opusDecoder, filename, ffmpegProcess } = await this.audioService.createStreamAndOpusDecoder(guildId);
      const recordingInfo = await this.audioService.StartRecording(connection, opusDecoder, outputStream);
      recordingInfo.filename = filename;
      recordingInfo.ffmpegProcess = ffmpegProcess;

      // Set up rotation (time‑based) and size‑check intervals.
      const rotationInterval = setInterval(() => {
        this.rotateStreams(guildId).catch(error => {
          this.logger.error(`[VoiceRecorder] Error rotating files:`, error);
        });
      }, baseConfig.TIME_INTERVAL * 60 * 1000);

      const sizeCheckInterval = setInterval(async () => {
        try {
          const currentInfo = this.activeRecordings.get(guildId);
          if (!currentInfo) return;
          const stats = await fs.promises.stat(currentInfo.filename);
          if (stats.size >= baseConfig.MAX_FILE_SIZE) {
            this.logger.info(`[VoiceRecorder] Size check: file size (${stats.size} bytes) exceeded limit (${baseConfig.MAX_FILE_SIZE} bytes), triggering rotation...`);
            await this.rotateStreams(guildId);
          }
        } catch (error) {
          this.logger.error(`[VoiceRecorder] Error checking file size:`, error);
        }
      }, baseConfig.SIZE_CHECK_INTERVAL);

      recordingInfo.rotationInterval = rotationInterval;
      recordingInfo.sizeCheckInterval = sizeCheckInterval;

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
      await this.cleanup(guildId);
      throw error;
    }
  }

  async cleanup(guildId) {
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
    await this.closeStreams(recordingInfo);
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (!fs.existsSync(recordingInfo.filename)) {
      this.logger.error('[VoiceRecorder] Recording file does not exist');
      return;
    }

    let mp3File;
    try {
      // Because we now encode to MP3 in real time, we can use the file directly.
      mp3File = recordingInfo.filename;
      const transummarize = await this.TrascribeAndSummarize(recordingInfo, guildId, mp3File);
      await this.sendSummaryToChannel(guildId, transummarize);

      const { summary, transcript, timestamp } = transummarize;
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
