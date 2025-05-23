import { EventEmitter } from 'events';
import logger from './utils/logger.js';
import RecordingEvents from './events/RecordingEvents.js';
import { EndBehaviorType } from '@discordjs/voice';
import fs from 'node:fs';
import baseConfig from './config.js'

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
    this.client = services.get('client');
    this.recordingProcessor = services.get('recordingProcessor');
    this.config = baseConfig;
    // Active sessions keyed by guild ID.
    // Each session: { connection, userRecordings: Map<userId, recording>, startTime, lastActivityTime }
    this.activeRecordings = new Map();

    // Intervals for rotation.
    this.rotationIntervals = new Map();
    this.sizeCheckIntervals = new Map();
    this.inactivityIntervals = new Map();

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

  /**
   * Start a new recording session in a voice channel.
   * Sets up per‑user pipelines and schedules rotation.
   */
  async startRecording(voiceChannel) {
    if (!voiceChannel) throw new Error('No voice channel provided');
    const guildId = voiceChannel.guild.id;
    try {
      await this.voiceState.joinChannel(voiceChannel);
      this.logger.info(`[VoiceRecorder] Joined voice channel for guild ${guildId}`);
      this.events.emit(RecordingEvents.JOINED_CHANNEL, { guildId });

      const connection = this.voiceState.getConnection(guildId);
      if (!connection) throw new Error('No connection after joining channel');

      // Create the initial session.
      const session = {
        connection,
        userRecordings: new Map(),
        startTime: Date.now(),
        lastActivityTime: Date.now(),
        summaries: []
      };

      // Listen for speaking events.
      connection.receiver.speaking.on('start', async (userId) => {
        // Update last activity time when someone starts speaking
        session.lastActivityTime = Date.now();
        
        if (!session.userRecordings.has(userId)) {
          try {
            const user = await this.client.users.fetch(userId);
            if (user.bot) {
              this.logger.info(`[VoiceRecorder] Ignoring bot user ${userId}`);
              return;
            }
            this.logger.info(`[VoiceRecorder] User ${userId} started speaking`);
            const userRecording = await this.audioService.startUserRecording(userId, connection);
            const audioStream = connection.receiver.subscribe(userId, {
              end: { behavior: EndBehaviorType.Manual }
            });
            audioStream
              .pipe(userRecording.opusDecoder, { end: false })
              .pipe(userRecording.outputStream, { end: false });
            audioStream.on('data', (data) => {
              userRecording.dataReceived = true;
              userRecording.bytesWritten += data.length;
            });
            session.userRecordings.set(userId, userRecording);
          } catch (error) {
            this.logger.error(`[VoiceRecorder] Error starting recording for user ${userId}:`, error);
          }
        }
      });

      connection.receiver.speaking.on('end', (userId) => {
        if (session.userRecordings.has(userId)) {
          this.logger.info(`[VoiceRecorder] User ${userId} stopped speaking`);
        }
      });

      this.activeRecordings.set(guildId, session);

      // Set up inactivity check (5 minutes)
      const inactivityInterval = setInterval(async () => {
        const currentSession = this.activeRecordings.get(guildId);
        if (!currentSession) return;
        
        const inactiveTime = Date.now() - currentSession.lastActivityTime;
        if (inactiveTime >= 5 * 60 * 1000) { // 5 minutes in milliseconds
          this.logger.info(`[VoiceRecorder] No activity detected for 5 minutes in guild ${guildId}, stopping recording`);
          await this.stopRecording(guildId);
        }
      }, 30000); // Check every 30 seconds
      this.inactivityIntervals.set(guildId, inactivityInterval);

      // Set up time-based rotation.
      const timeInterval = await this.configService.getTimeInterval(guildId); // in ms
      const rotationInterval = setInterval(() => {
        this.rotateSession(guildId).catch(err => this.logger.error(`[VoiceRecorder] Rotation error for guild ${guildId}:`, err));
      }, timeInterval);
      this.rotationIntervals.set(guildId, rotationInterval);

      // Set up size-based rotation.
      const sizeCheckInterval = setInterval(async () => {
        const session = this.activeRecordings.get(guildId);
        if (!session) return;
        let shouldRotate = false;
        for (const rec of session.userRecordings.values()) {
          try {
            const stats = await fs.promises.stat(rec.filename);
            if (stats.size >= this.config.MAX_FILE_SIZE) {
              shouldRotate = true;
              break;
            }
          } catch (err) {
            this.logger.error(`[VoiceRecorder] Error checking file size for user ${rec.userId}:`, err);
          }
        }
        if (shouldRotate) {
          this.logger.info(`[VoiceRecorder] Size check triggered rotation for guild ${guildId}`);
          await this.rotateSession(guildId);
        }
      }, this.config.SIZE_CHECK_INTERVAL);
      this.sizeCheckIntervals.set(guildId, sizeCheckInterval);

      this.events.emit(RecordingEvents.RECORDING_STARTED, { guildId });
      this.logger.info(`[VoiceRecorder] Started recording session for guild ${guildId}`);
      return session;
    } catch (error) {
      this.logger.error(`[VoiceRecorder] Failed to start recording:`, error);
      await this.cleanup(guildId);
      throw error;
    }
  }

  /**
   * Rotate the current session.
   * Creates a new session (new pipelines) while processing the old session.
   */
  async rotateSession(guildId) {
    const oldSession = this.activeRecordings.get(guildId);
    if (!oldSession) {
      this.logger.warn(`[VoiceRecorder] No active session to rotate for guild ${guildId}`);
      return;
    }
    this.logger.info(`[VoiceRecorder] Rotating recording session for guild ${guildId}`);
    const connection = oldSession.connection;
    const newSession = {
      connection,
      userRecordings: new Map(),
      startTime: Date.now()
    };

    // For every active user in the old session, start a new pipeline.
    for (const [userId, oldRec] of oldSession.userRecordings.entries()) {
      try {
        const newRec = await this.audioService.startUserRecording(userId, connection);
        const audioStream = connection.receiver.subscribe(userId, {
          end: { behavior: EndBehaviorType.Manual }
        });
        audioStream
          .pipe(newRec.opusDecoder, { end: false })
          .pipe(newRec.outputStream, { end: false });
        let count = 0;  
        audioStream.on('data', (data) => {
          newRec.dataReceived = true;
          newRec.bytesWritten += data.length;
          count++;
          if (count % 100 === 0) {
            this.logger.info(`[VoiceRecorder] User ${userId} has written ${newRec.bytesWritten} bytes`);
          }
        });
        newSession.userRecordings.set(userId, newRec);
      } catch (err) {
        this.logger.error(`[VoiceRecorder] Error starting new pipeline for user ${userId} during rotation:`, err);
      }
    }

    // Replace active session with new session.
    this.activeRecordings.set(guildId, newSession);
    this.logger.info(`[VoiceRecorder] New recording session started for guild ${guildId}`);

    // Delay processing the old session to allow for pending writes.
    setTimeout(async () => {
      try {
        const summaryObject = await this.recordingProcessor.processRecordings(
          guildId,
          oldSession.userRecordings
        );
        const session = this.activeRecordings.get(guildId);
        session.summaries.push(summaryObject);
        // Only send a message if transcripts exist.
        if (summaryObject) {
          this.events.emit(RecordingEvents.ROTATION_COMPLETED, { guildId, summaryObject });
          this.logger.info(`[VoiceRecorder] Successfully processed rotated session for guild ${guildId}`);
          const summaryChannel = await this.configService.getSummaryChannel(guildId);
          if (summaryChannel) {
            await this.channelService.sendMessage(summaryChannel, summaryObject);
          }
        } else {
          this.logger.info(`[VoiceRecorder] Rotated session for guild ${guildId} produced no transcripts.`);
        }
      } catch (err) {
        this.logger.error(`[VoiceRecorder] Error processing rotated session for guild ${guildId}:`, err);
        this.events.emit(RecordingEvents.ROTATION_ERROR, { guildId, error: err });
      }
    }, this.config.ROTATION_DELAY);
  }

  /**
   * Stop the entire recording session.
   */
  async stopRecording(guildId) {
    if (!guildId || !this.activeRecordings.has(guildId)) return;
    this.logger.info(`[VoiceRecorder] Stopping recording for guild ${guildId}`);
    const session = this.activeRecordings.get(guildId);
    try {
      // Clear rotation and size-check intervals.
      if (this.rotationIntervals.has(guildId)) {
        clearInterval(this.rotationIntervals.get(guildId));
        this.rotationIntervals.delete(guildId);
      }
      if (this.sizeCheckIntervals.has(guildId)) {
        clearInterval(this.sizeCheckIntervals.get(guildId));
        this.sizeCheckIntervals.delete(guildId);
      }
      const summaryObject = await this.recordingProcessor.processRecordings(
        guildId,
        session.userRecordings
      );

      session.summaries.push(summaryObject);

      const summariesObject = await this.transcriptionService.generateSummaryFromSessionSummaries(session.summaries, guildId);

      this.events.emit(RecordingEvents.RECORDING_STOPPED, { guildId, summaryObject });
      const summaryChannel = await this.configService.getSummaryChannel(guildId);
      if (summaryChannel) {
        await this.channelService.sendMessage(summaryChannel, summaryObject);
        await this.channelService.sendMessage(summaryChannel, summariesObject);
      }
      await this.cleanup(guildId);

    } catch (error) {
      this.logger.error(`[VoiceRecorder] Error stopping recording:`, error);
      await this.cleanup(guildId);
      throw error;
    }
  }

  async cleanup(guildId) {
    await this.voiceState.leaveChannel(guildId);
    this.activeRecordings.delete(guildId);
    if (this.rotationIntervals.has(guildId)) {
      clearInterval(this.rotationIntervals.get(guildId));
      this.rotationIntervals.delete(guildId);
    }
    if (this.sizeCheckIntervals.has(guildId)) {
      clearInterval(this.sizeCheckIntervals.get(guildId));
      this.sizeCheckIntervals.delete(guildId);
    }
    if (this.inactivityIntervals.has(guildId)) {
      clearInterval(this.inactivityIntervals.get(guildId));
      this.inactivityIntervals.delete(guildId);
    }
  }

  async getStatus(guildId) {
    const session = this.activeRecordings.get(guildId);
    if (!session) return null;
    const status = {
      status: 'Recording',
      duration: Date.now() - session.startTime,
      userRecordings: []
    };
    for (const [userId, rec] of session.userRecordings.entries()) {
      status.userRecordings.push({
        userId,
        bytesWritten: rec.bytesWritten,
        dataReceived: rec.dataReceived
      });
    }
    return status;
  }
}
