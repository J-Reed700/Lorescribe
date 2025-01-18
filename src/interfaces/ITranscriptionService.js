/**
 * @interface ITranscriptionService
 */
class ITranscriptionService {
    /**
     * @param {string} filepath
     * @returns {Promise<string>}
     */
    transcribeAudio(filepath) {}

    /**
     * @param {string} text
     * @returns {Promise<string>}
     */
    generateSummary(text) {}
}

module.exports = ITranscriptionService; 