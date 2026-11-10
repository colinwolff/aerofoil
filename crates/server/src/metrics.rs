//! Metrics counters for ingestion throughput and error tracking.

use core::sync::atomic::{AtomicU64, Ordering};

/// Cumulative ingest telemetry counters.
#[derive(Debug, Default)]
pub struct IngestMetrics {
    /// Total frames ingested on 1090 MHz.
    pub frames_1090: AtomicU64,
    /// Total frames ingested on 978 MHz.
    pub frames_978: AtomicU64,
    /// Total raw bytes read on 1090 MHz.
    pub bytes_1090: AtomicU64,
    /// Total raw bytes read on 978 MHz.
    pub bytes_978: AtomicU64,
    /// Malformed frames or stream decoding errors.
    pub error_count: AtomicU64,
}

impl IngestMetrics {
    /// Creates a zeroed set of counters.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Increments frame count for the given band.
    pub fn inc_frames(&self, is_1090: bool) {
        if is_1090 {
            self.frames_1090.fetch_add(1, Ordering::Relaxed);
        } else {
            self.frames_978.fetch_add(1, Ordering::Relaxed);
        }
    }

    /// Adds raw byte volume for the given band.
    pub fn add_bytes(&self, is_1090: bool, bytes: u64) {
        if is_1090 {
            self.bytes_1090.fetch_add(bytes, Ordering::Relaxed);
        } else {
            self.bytes_978.fetch_add(bytes, Ordering::Relaxed);
        }
    }

    /// Increments the error counter.
    pub fn inc_errors(&self) {
        self.error_count.fetch_add(1, Ordering::Relaxed);
    }
}
