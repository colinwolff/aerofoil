//! `aerofoil-sdr` — Software Defined Radio (SDR) DSP and demodulation engine.
//!
//! Provides zero-allocation, dependency-free DSP algorithms for computing sample magnitude,
//! sliding preamble correlation for 1090 MHz PPM, and cross-product FM discrimination for 978 MHz UAT.

pub mod fsk;
pub mod magnitude;
pub mod metrics;
pub mod ppm;

pub use fsk::discriminate_fsk4;
pub use magnitude::compute_magnitude_u16;
pub use metrics::DspBenchmarkResult;
pub use ppm::{PREAMBLE_LEN_SAMPLES, correlate_preamble};
