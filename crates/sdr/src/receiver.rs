//! SDR receiver configuration and streaming 1090 MHz PPM bit demodulation (`AF-84`).

use crate::magnitude::compute_magnitude_u16;
use crate::ppm::{PREAMBLE_LEN_SAMPLES, correlate_preamble};

/// Default RF center frequency for Mode S / 1090ES surveillance (1090 MHz).
pub const FREQ_1090_MHZ: u32 = 1_090_000_000;
/// Default RF center frequency for UAT surveillance (978 MHz).
pub const FREQ_978_MHZ: u32 = 978_000_000;
/// Standard RTL-SDR sample rate for 1090 MHz PPM demodulation (2.0 Msps).
pub const SAMPLE_RATE_2MSPS: u32 = 2_000_000;

/// Configuration parameters for an SDR RF receiver.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SdrReceiverConfig {
    pub frequency_hz: u32,
    pub sample_rate_hz: u32,
    pub auto_gain: bool,
}

impl Default for SdrReceiverConfig {
    fn default() -> Self {
        Self {
            frequency_hz: FREQ_1090_MHZ,
            sample_rate_hz: SAMPLE_RATE_2MSPS,
            auto_gain: true,
        }
    }
}

/// Zero-allocation 1090 MHz Mode S PPM bit slicer and frame demodulator.
#[derive(Debug)]
pub struct PpmDemodulator {
    mag_buf: [u16; 4096],
}

impl Default for PpmDemodulator {
    fn default() -> Self {
        Self::new()
    }
}

impl PpmDemodulator {
    /// Creates a new demodulator instance.
    #[must_use]
    pub fn new() -> Self {
        Self {
            mag_buf: [0u16; 4096],
        }
    }

    /// Demodulates raw interleaved 8-bit I/Q samples into decoded 112-bit (14-byte) Mode S frames.
    ///
    /// Invokes `on_frame` for each successfully sliced frame. Returns total frames found.
    pub fn demodulate_iq<F>(&mut self, iq: &[u8], mut on_frame: F) -> usize
    where
        F: FnMut(&[u8; 14]),
    {
        let samples = compute_magnitude_u16(iq, &mut self.mag_buf);
        if samples < PREAMBLE_LEN_SAMPLES + 224 {
            return 0;
        }

        let mut frames_detected = 0;
        let mut idx = 0;
        let limit = samples.saturating_sub(PREAMBLE_LEN_SAMPLES + 224);

        while idx <= limit {
            if correlate_preamble(&self.mag_buf[idx..]).is_some() {
                // Slicing 112 Mode S bits (each bit = 2 half-microsecond samples at 2 Msps)
                let data_offset = idx + PREAMBLE_LEN_SAMPLES;
                let mut frame = [0u8; 14];

                for bit in 0..112 {
                    let s0 = self.mag_buf[data_offset + 2 * bit];
                    let s1 = self.mag_buf[data_offset + 2 * bit + 1];

                    // Manchester decision: bit is 1 if pulse is in first half-microsecond
                    if s0 > s1 {
                        let byte_idx = bit / 8;
                        let bit_idx = 7 - (bit % 8);
                        frame[byte_idx] |= 1 << bit_idx;
                    }
                }

                on_frame(&frame);
                frames_detected += 1;
                idx += PREAMBLE_LEN_SAMPLES + 224; // Jump past frame
            } else {
                idx += 1;
            }
        }

        frames_detected
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ppm_demodulator_synthetic_frame() {
        let mut demod = PpmDemodulator::new();
        let expected_frame: [u8; 14] = [
            0x8D, 0x48, 0x40, 0xD6, 0x20, 0x2C, 0xC3, 0x71, 0xC3, 0x2C, 0xE0, 0x57, 0x60, 0x98,
        ];

        // Synthesize 2 Msps magnitude sequence:
        // Preamble: [H, L, H, L, L, L, L, H, L, H, L, L, L, L, L, L]
        let mut mag = Vec::new();
        // Leading quiet
        mag.extend_from_slice(&[10u16; 8]);
        // Preamble (16 samples)
        mag.extend_from_slice(&[
            120, 10, 120, 10, 10, 10, 10, 120, 10, 120, 10, 10, 10, 10, 10, 10,
        ]);

        // Modulate 112 bits Manchester: 1 -> [100, 10], 0 -> [10, 100]
        for byte in expected_frame {
            for bit in (0..8).rev() {
                if (byte >> bit) & 1 == 1 {
                    mag.push(100);
                    mag.push(10);
                } else {
                    mag.push(10);
                    mag.push(100);
                }
            }
        }
        // Trailing quiet
        mag.extend_from_slice(&[10u16; 16]);

        // Convert magnitude to interleaved raw IQ: I = 128 + mag, Q = 128
        let mut iq = Vec::new();
        for &m in &mag {
            let i = 128 + (m.min(127) as u8);
            iq.push(i);
            iq.push(128);
        }

        let mut recovered = Vec::new();
        let count = demod.demodulate_iq(&iq, |f| recovered.push(*f));

        assert_eq!(count, 1);
        assert_eq!(recovered.len(), 1);
        assert_eq!(recovered[0], expected_frame);
    }
}
