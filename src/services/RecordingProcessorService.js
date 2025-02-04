import fs from 'node:fs';
import logger from '../utils/logger.js';

export default class RecordingProcessor {
  /**
   * @param {Object} options
   * @param {StorageService} options.storage
   * @param {TranscriptionService} options.transcriptionService
   * @param {ChannelService} options.channelService
   * @param {SummaryJobService} options.summaryJobs
   */
  constructor({ storage, transcriptionService, channelService, summaryJobs }) {
    this.storage = storage;
    this.transcriptionService = transcriptionService;
    this.channelService = channelService;
    this.summaryJobs = summaryJobs;
  }

  /**
   * Process all user recordings from a given session.
   * Closes each recording, transcribes the resulting file,
   * and deletes the file after processing.
   *
   * Returns an array of objects: [{ userId, transcript }, ...]
   */
  async processRecordings(guildId, userRecordings, audioService) {
    const transcripts = [];
    for (const [userId, recording] of userRecordings.entries()) {
      try {
        await audioService.closeUserRecording(recording);
      } catch (err) {
        logger.error(`[RecordingProcessor] Error closing recording for user ${userId}:`, err);
      }
      try {
        const transcript = await this.transcriptionService.transcribeAudio(recording.filename, guildId);
        transcripts.push({ userId, transcript });
      } catch (err) {
        logger.error(`[RecordingProcessor] Error transcribing for user ${userId}:`, err);
      } finally {
        try {
          await this.storage.deleteFile(recording.filename);
        } catch (err) {
          logger.error(`[RecordingProcessor] Error deleting file for user ${userId}:`, err);
        }
      }
    }
    return transcripts;
  }
}
