//! Hardware feasibility and throughput benchmark metrics.

use core::time::Duration;

/// Performance benchmark result for a DSP pipeline stage.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DspBenchmarkResult {
    /// Total number of samples processed.
    pub total_samples: usize,
    /// Elapsed execution duration.
    pub duration: Duration,
    /// Sample processing rate in Megasamples per second (Msps).
    pub msps: f64,
    /// Average processing time in nanoseconds per sample.
    pub ns_per_sample: f64,
}

impl DspBenchmarkResult {
    /// Computes benchmark metrics from sample count and elapsed time.
    #[must_use]
    pub fn compute(total_samples: usize, duration: Duration) -> Self {
        let secs = duration.as_secs_f64();
        let msps = if secs > 0.0 {
            (total_samples as f64) / secs / 1_000_000.0
        } else {
            0.0
        };
        let ns_per_sample = if total_samples > 0 {
            duration.as_nanos() as f64 / (total_samples as f64)
        } else {
            0.0
        };

        Self {
            total_samples,
            duration,
            msps,
            ns_per_sample,
        }
    }

    /// Evaluates whether the measured throughput satisfies real-time dual-band requirements.
    ///
    /// For dual-band dongles running at 2.4 Msps per band, the per-sample time budget is
    /// `1 / (2 * 2.4 MHz) ≈ 208 ns` across both bands (or 416 ns on independent cores).
    #[must_use]
    pub fn is_viable_dual_band_single_core(&self) -> bool {
        self.msps >= 4.8
    }

    /// Evaluates whether the throughput is viable on a multi-core target (such as Raspberry Pi 4).
    #[must_use]
    pub fn is_viable_dual_band_multi_core(&self) -> bool {
        self.msps >= 2.4
    }
}
