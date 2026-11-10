//! Recording sink abstraction and error models.

use crate::frame::RecordedFrame;

/// Failure conditions encountered while persisting surveillance frames.
#[derive(Debug)]
pub enum SinkError {
    /// Serialization failure.
    Serialization(String),
    /// Underlying I/O error occurred while writing.
    Io(std::io::Error),
    /// Sink background worker thread disconnected or terminated unexpectedly.
    WorkerDisconnected,
}

impl core::fmt::Display for SinkError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Serialization(msg) => write!(f, "serialization error: {msg}"),
            Self::Io(err) => write!(f, "io error: {err}"),
            Self::WorkerDisconnected => write!(f, "worker disconnected"),
        }
    }
}

impl std::error::Error for SinkError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(err) => Some(err),
            _ => None,
        }
    }
}

impl From<std::io::Error> for SinkError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

/// Abstract recording sink for capturing raw RF frames.
///
/// Implementations must be bounded drop-oldest subscribers and must never block
/// the critical decode loop.
pub trait RecordSink: Send + Sync {
    /// Enqueues a captured frame for recording.
    ///
    /// If the internal queue is full, the oldest frame is dropped to guarantee
    /// zero backpressure into the caller.
    ///
    /// # Errors
    /// Returns [`SinkError::WorkerDisconnected`] if the background writer has exited.
    fn record(&self, frame: RecordedFrame) -> Result<(), SinkError>;

    /// Blocks until all queued frames are written to underlying storage.
    ///
    /// # Errors
    /// Returns [`SinkError`] on I/O or worker failure.
    fn flush(&self) -> Result<(), SinkError>;

    /// Total count of frames dropped due to queue saturation.
    fn drops(&self) -> u64;

    /// Total count of frames successfully written to storage.
    fn recorded(&self) -> u64;
}
