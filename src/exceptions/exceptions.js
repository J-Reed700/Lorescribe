// Custom exceptions for the Discord bot

export class BotError extends Error {
    constructor(message, error) {
        super(message);
        this.name = 'BotError';
        this.error = error;
    }
}

export class CommandError extends BotError {
    constructor(message, error) {
        super(message);
        this.name = 'CommandError';
        this.error = error;
    }
}

export class VoiceError extends BotError {
    constructor(message, error) {
        super(message);
        this.name = 'VoiceError'; 
        this.error = error;
    }
}

export class ConfigError extends BotError {
    constructor(message, error) {
        super(message);
        this.name = 'ConfigError';
        this.error = error;
    }
}

export class APIError extends BotError {
    constructor(message, statusCode = null, error) {
        super(message)  ;
        this.name = 'APIError';
        this.statusCode = statusCode;
        this.error = error;
    }
}

export class ValidationError extends BotError {
    constructor(message, error) {
        super(message);
        this.name = 'ValidationError';
        this.error = error;
    }
}

export class DatabaseError extends BotError {
    constructor(message, error) {
        super(message);
        this.name = 'DatabaseError';
        this.error = error;
    }
}

export class AuthenticationError extends BotError {
    constructor(message, error) {
        super(message);
        this.name = 'AuthenticationError';
        this.error = error;
    }
}

export class InteractionError extends BotError {
    constructor(message, error) {
        super(message);
        this.name = 'InteractionError';
        this.error = error;
    }
}