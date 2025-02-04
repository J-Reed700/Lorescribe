import fs from 'node:fs';
import logger from '../utils/logger.js';

export default class RecordingProcessor {
  /**
   * Process all user recordings from a session.
   * Returns an array of transcript objects.
   */
  async processRecordings(guildId, userRecordings, audioService, transcriptionService, storage) {
    const transcripts = [];
    let anyData = false;
    for (const [userId, recording] of userRecordings.entries()) {
      try {
        await audioService.closeUserRecording(recording);
      } catch (err) {
        logger.error(`[RecordingProcessor] Error closing recording for user ${userId}:`, err);
      }
      // Check if any recording received data.
      if (recording.dataReceived) {
        anyData = true;
      }
      try {
        const transcript = await transcriptionService.transcribeAudio(recording.filename, guildId);
        transcripts.push({ userId, transcript });
      } catch (err) {
        logger.error(`[RecordingProcessor] Error transcribing for user ${userId}:`, err);
      } finally {
        try {
          await storage.deleteFile(recording.filename);
        } catch (err) {
          logger.error(`[RecordingProcessor] Error deleting file for user ${userId}:`, err);
        }
      }
    }
    // If none of the recordings captured any data, return a default transcript.
    if (!anyData) {
      return [{ transcript: 'No audio detected during this session.' }];
    }
    return transcripts;
  }
}
