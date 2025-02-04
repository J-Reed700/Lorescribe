import { workerData } from 'worker_threads';

const { services } = workerData;
const transcriptionService = services.get('transcription');

const TRANSCRIPTION_TIMEOUT = 3 * 60 * 1000; // 3 minute timeout for transcription
const SUMMARY_TIMEOUT = 2 * 60 * 1000; // 2 minute timeout for summary

export default async function processRecording({ 
  audioPath, 
  guildId
}) {
  try {
    // Transcribe with timeout
    const transcriptionPromise = transcriptionService.transcribeAudio(audioPath, guildId);
    const transcriptionTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Transcription timeout')), TRANSCRIPTION_TIMEOUT);
    });

    const transcript = await Promise.race([
      transcriptionPromise,
      transcriptionTimeoutPromise
    ]);

    if (!transcript || transcript.trim().length === 0) {
      return {
        success: true,
        transcript: '',
        summary: 'No speech detected in recording.',
        isTranscription: false,
        isUnableToSummarize: true
      };
    }

    // Generate summary with timeout
    const summaryPromise = transcriptionService.generateSummary(transcript, guildId);
    const summaryTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Summary generation timeout')), SUMMARY_TIMEOUT);
    });

    const { summary, isTranscription, isUnableToSummarize } = await Promise.race([
      summaryPromise,
      summaryTimeoutPromise
    ]);

    return {
      success: true,
      transcript,
      summary,
      isTranscription,
      isUnableToSummarize
    };

  } catch (error) {
    return {
      success: false,
      error: error.message || 'Unknown error in worker thread'
    };
  }
} 