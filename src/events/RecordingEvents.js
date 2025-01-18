class RecordingEvents {
    static RECORDING_STARTED = 'recording_started'
    static RECORDING_STOPPED = 'recording_stopped'
    static RECORDING_ERROR = 'recording_error'
    static RECORDING_SUMMARIZED = 'recording_summarized'
    static CONNECTION_CLOSED = 'connection_closed'
    static CONNECTION_ERROR = 'connection_error'
    static INTERVAL_COMPLETED = 'interval_completed'
    static SUMMARY_GENERATION_FAILED = 'summary_generation_failed'
}

module.exports = RecordingEvents;