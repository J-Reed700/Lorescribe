import { EventEmitter } from 'events';
import logger from './utils/logger.js';
import RecordingEvents from './events/RecordingEvents.js';
import { EndBehaviorType } from '@discordjs/voice';

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
    this.client = services.get('client'); // needed for fetching user info
    this.recordingProcessor = services.get('recordingProcessor'); // our new service

    // Active recordings are keyed by guild ID.
    // Each recording session holds:
    //    - connection,
    //    - userRecordings: Map of userId => recording pipeline info,
    //    - startTime.
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

  /**
   * Join the voice channel and start per‑user recordings.
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

      // Create a recording session object.
      const session = {
        connection,
        userRecordings: new Map(),
        startTime: Date.now()
      };

      // Listen for speaking events.
      connection.receiver.speaking.on('start', async (userId) => {
        // Start a recording for a user only if not already started.
        if (!session.userRecordings.has(userId)) {
          try {
            const user = await this.client.users.fetch(userId);
            if (user.bot) {
              this.logger.info(`[VoiceRecorder] Ignoring bot user ${userId}`);
              return;
            }
            this.logger.info(`[VoiceRecorder] User ${userId} started speaking`);
            const userRecording = await this.audioService.startUserRecording(userId, connection);

            // Subscribe to the user’s audio.
            const audioStream = connection.receiver.subscribe(userId, {
              end: { behavior: EndBehaviorType.Manual }
            });
            audioStream
              .pipe(userRecording.opusDecoder, { end: false })
              .pipe(userRecording.outputStream, { end: false });

            // Optionally, update dataReceived and bytesWritten.
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
          // You may choose to close the user’s recording immediately or leave it open
          // until the overall session is stopped.
        }
      });

      this.activeRecordings.set(guildId, session);
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
   * Stop the recording session for the given guild.
   * This will process all per‑user recordings and emit an event with the transcripts.
   */
  async stopRecording(guildId) {
    if (!guildId || !this.activeRecordings.has(guildId)) return;
    this.logger.info(`[VoiceRecorder] Stopping recording for guild ${guildId}`);
    const session = this.activeRecordings.get(guildId);
    try {
      // Use the RecordingProcessor to close all recordings,
      // transcribe them, and clean up their files.
      const transcripts = await this.recordingProcessor.processRecordings(
        guildId,
        session.userRecordings,
        this.audioService
      );
      this.events.emit(RecordingEvents.RECORDING_STOPPED, { guildId, transcripts });
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
