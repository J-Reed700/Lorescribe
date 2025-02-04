import fs from 'node:fs';
import logger from '../utils/logger.js';
import Piscina from 'piscina';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const PROCESSING_TIMEOUT = 5 * 60 * 1000; // 5 minute timeout
const MAX_THREADS = Math.max(1, os.cpus().length - 1); // Leave one core free

export default class RecordingProcessor {
  constructor(services) {
    this.audioService = services.get('audio');
    this.transcriptionService = services.get('transcription');
    this.storage = services.get('storage');

    const __dirname = path.dirname(fileURLToPath(import.meta.url));o
    
    this.threadPool = new Piscina({
      filename: path.resolve(__dirname, '../workers/transcriptionWorker.js'),
      maxThreads: MAX_THREADS,
    });
  }

  /**
   * Process all user recordings from a session.
   * Returns an array of transcript objects.
   */
  async processRecordings(guildId, userRecordings) {
    let anyData = false;

    // First close all recordings
    for (const [userId, recording] of userRecordings.entries()) {
      try {
        await this.audioService.closeUserRecording(recording);
        if (recording.dataReceived) {
          anyData = true;
        }
      } catch (err) {
        logger.error(`[RecordingProcessor] Error closing recording for user ${userId}:`, err);
      }
    }

    if (!anyData) {
      return [{ summary: 'No audio detected during this session.' }];
    }

    // Process recordings in parallel with timeout
    const processingPromises = Array.from(userRecordings.entries()).map(async ([userId, recording]) => {
      try {
        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Processing timeout')), PROCESSING_TIMEOUT);
        });

        // Run the processing in a worker thread with timeout
        const result = await Promise.race([
          this.threadPool.run({
            audioPath: recording.filename,
            guildId,
            transcriptionService: this.transcriptionService
          }),
          timeoutPromise
        ]);

        // Clean up the recording file
        try {
          await this.storage.deleteFile(recording.filename);
        } catch (err) {
          logger.error(`[RecordingProcessor] Error deleting file for user ${userId}:`, err);
        }

        if (!result.success) {
          throw new Error(result.error);
        }

        return {
          userId,
          transcript: result.transcript,
          summary: result.isUnableToSummarize ? 
            `Unable to summarize recording. Direct transcription:\n\n${result.summary}` :
            result.isTranscription ?
              `Error generating summary. Direct transcription:\n\n${result.summary}` :
              result.summary
        };
      } catch (error) {
        logger.error(`[RecordingProcessor] Error processing recording for user ${userId}:`, error);
        return null;
      }
    });

    const results = await Promise.all(processingPromises);
    const validResults = results.filter(result => result !== null);

    return validResults.length > 0 ? validResults : [{ summary: 'Failed to process any recordings in this session.' }];
  }

  async cleanup() {
    try {
      await this.threadPool.destroy();
    } catch (err) {
      logger.error('[RecordingProcessor] Error cleaning up thread pool:', err);
    }
  }
}
