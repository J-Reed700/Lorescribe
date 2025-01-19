import winston from 'winston';
const { createLogger, format, transports } = winston;
const { combine, timestamp, printf, colorize } = format;

// Custom format for log messages
const myFormat = printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} ${level}: ${message}`;
    
    // Add metadata if present
    if (Object.keys(metadata).length > 0) {
        msg += JSON.stringify(metadata);
    }
    
    return msg;
});

// Create the logger
const logger = createLogger({
    format: combine(
        timestamp(),
        colorize(),
        myFormat
    ),
    transports: [
        new transports.Console({
            level: process.env.LOG_LEVEL || 'info'
        }),
        new transports.File({ 
            filename: 'error.log', 
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        new transports.File({ 
            filename: 'combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        })
    ]
});

export default logger;