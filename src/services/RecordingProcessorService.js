import fs from 'node:fs';
import logger from '../utils/logger.js';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const PROCESSING_TIMEOUT = 5 * 60 * 1000; // Overall 5 minute timeout per recording
const TRANSCRIPTION_TIMEOUT = 3 * 60 * 1000; // 3 minute timeout for transcription
const SUMMARY_TIMEOUT = 2 * 60 * 1000; // 2 minute timeout for summary

export default class RecordingProcessor {
  constructor(services) {
    this.audioService = services.get('audio');
    this.transcriptionService = services.get('transcription');
    this.storage = services.get('storage');
    this.summaryJobService = services.get('summaryJobs');
    this.channelService = services.get('channel');
  }

  async _processRecording({ audioPath, guildId }) {
    try {
      // Transcribe with timeout
      const transcriptionPromise = this.transcriptionService.transcribeAudio(audioPath, guildId);
      const transcriptionTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Transcription timeout')), TRANSCRIPTION_TIMEOUT);
      });
      const transcript = await Promise.race([
        transcriptionPromise,
        transcriptionTimeoutPromise
      ]);

      if (!transcript || transcript.trim().length === 0) {
        return {
          success: false,
          transcript: ''
        };
      }

      return {
        success: true,
        transcript
      };

    } catch (error) {
      return {
        success: false,
        error: error.message || 'Unknown error in processing'
      };
    }
  }

  /**
   * Process all user recordings from a session and return a combined transcript with user context
   */
  async processRecordings(guildId, userRecordings) {
    let anyData = false;
    let jobId = null;
    // Close all recordings first
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
      return { transcript: 'No audio detected during this session.' };
    }

    // Process each recording and combine into one transcript
    const processingPromises = Array.from(userRecordings.entries()).map(async ([userId, recording]) => {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Processing timeout')), PROCESSING_TIMEOUT);
        });

        const result = await Promise.race([
          this._processRecording({ audioPath: recording.filename, guildId }),
          timeoutPromise
        ]);

        const username = await this.channelService.getUserName(userId);

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
          username,
          transcript: result.transcript
        };

      } catch (error) {
        logger.error(`[RecordingProcessor] Error processing recording for user ${userId}:`, error);
        return null;
      }
    });

    const results = await Promise.all(processingPromises);
    const validResults = results.filter(result => result !== null);

    if (validResults.length === 0) {
      return { transcript: 'Failed to process any recordings in this session.' };
    }

    // Combine all transcripts into one text with user context
    const combinedTranscript = validResults.map(result =>  
      `User Name: ${result.username} Transcript: \n${result.transcript}\n`
    ).join('\n');

    logger.info(`[RecordingProcessor] Combined transcript: ${combinedTranscript.substring(0, 100)}`);

    // Generate a single summary for the entire conversation
    try {
      const { summary, isTranscription, isUnableToSummarize } = await this.transcriptionService.generateSummary(
        `Please summarize this conversation between multiple users:\n${combinedTranscript}`,
        guildId
      );

      if(!isUnableToSummarize && isTranscription) {
        jobId = this.summaryJobService.scheduleSummaryGeneration(guildId, combinedTranscript);
      }

      return {
        transcript: combinedTranscript,
        summary,
        isTranscription,
        isUnableToSummarize,
        jobId,
        userId
      };
    } catch (error) {
      logger.error('[RecordingProcessor] Error generating summary:', error);
      return {
        transcript: combinedTranscript,
        summary: combinedTranscript,
        isTranscription: true,
        isUnableToSummarize: true
      };
    }
  }

  async cleanup() {
    // With no worker thread you don't need extra cleanup here.
  }
}
