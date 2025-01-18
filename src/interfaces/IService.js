/**
 * @interface
 * Base interface that all services should implement
 */
class IService {
    /**
     * Initialize the service
     * @returns {Promise<void>}
     */
    async initialize() {
        throw new Error('Service must implement initialize method');
    }

    /**
     * Clean up service resources
     * @returns {Promise<void>}
     */
    async dispose() {
        throw new Error('Service must implement dispose method');
    }
}

module.exports = IService; 