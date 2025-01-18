class RetryHandler {
    constructor(maxRetries = 3, initialDelay = 1000) {
        this.maxRetries = maxRetries;
        this.initialDelay = initialDelay;
    }

    async execute(operation, context = {}) {
        let lastError;
        let delay = this.initialDelay;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                // Don't retry if it's a fatal error
                if (this.isFatalError(error)) {
                    throw error;
                }

                // Last attempt failed
                if (attempt === this.maxRetries) {
                    break;
                }

                // Wait with exponential backoff
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            }
        }

        throw new Error(`Operation failed after ${this.maxRetries} attempts. Last error: ${lastError.message}`);
    }

    isFatalError(error) {
        // Add specific error types that shouldn't be retried
        const fatalErrors = [
            'ENOENT', // File not found
            'EACCES', // Permission denied
            'ERR_INVALID_ARG_TYPE', // Invalid argument type
            'InvalidTokenError', // Invalid Discord token
        ];

        return fatalErrors.includes(error.code) ||
               error.message.includes('Invalid token') ||
               error.message.includes('Unknown Channel');
    }
}

module.exports = RetryHandler; 