const logger = require('./logger');

function handleError(error) {
    const errorInfo = {
        message: error.message,
        stack: error.stack,
        name: error.name
    };

    if (error instanceof Error) {
        logger.error('Uncaught error:', errorInfo);
    } else {
        logger.error('Uncaught error:', error);
    }

    // Could add error reporting service here
    // reportError(error);
}

module.exports = { handleError }; 