/**
 * @interface IAudioService
 */
class IAudioService {
    /**
     * @param {import('discord.js').VoiceChannel} voiceChannel
     * @returns {Promise<import('@discordjs/voice').VoiceConnection>}
     */
    createVoiceConnection(voiceChannel) {}

    /**
     * @param {string} inputFile
     * @returns {Promise<string>} Path to converted MP3 file
     */
    convertToMp3(inputFile) {}
}

module.exports = IAudioService; 