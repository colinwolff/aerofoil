//! `aerofoil-sdr` — Software Defined Radio (SDR) DSP and demodulation engine.
//!
//! Provides zero-allocation, dependency-free DSP algorithms for computing sample magnitude,
//! sliding preamble correlation for 1090 MHz PPM, cross-product FM discrimination for 978 MHz UAT,
//! direct hardware streaming over `rtl_tcp`, and raw baseband sample recording.

pub mod fsk;
pub mod iq_capture;
pub mod magnitude;
pub mod metrics;
pub mod ppm;
pub mod receiver;
pub mod rtl_tcp;

pub use fsk::discriminate_fsk4;
pub use iq_capture::{IqFormat, IqWriter};
pub use magnitude::compute_magnitude_u16;
pub use metrics::DspBenchmarkResult;
pub use ppm::{PREAMBLE_LEN_SAMPLES, correlate_preamble};
pub use receiver::{
    FREQ_978_MHZ, FREQ_1090_MHZ, PpmDemodulator, SAMPLE_RATE_2MSPS, SdrReceiverConfig,
};
pub use rtl_tcp::{
    CMD_SET_FREQ, CMD_SET_FREQ_CORRECTION, CMD_SET_GAIN, CMD_SET_GAIN_MODE, CMD_SET_SAMPLE_RATE,
    RTL_TCP_MAGIC, RtlTcpClient, RtlTcpHeader,
};
