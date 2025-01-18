/**
 * @interface IConfigurationService
 */
class IConfigurationService {
    /**
     * @param {string} guildId
     * @returns {object|null}
     */
    getGuildConfig(guildId) {}

    /**
     * @param {string} guildId
     * @param {object} config
     * @returns {Promise<boolean>}
     */
    setGuildConfig(guildId, config) {}

    /**
     * @param {string} guildId
     * @returns {boolean}
     */
    hasOpenAIKey(guildId) {}
}

module.exports = IConfigurationService; 