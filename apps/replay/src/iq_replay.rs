//! RF I/Q sample replay and demodulation pipeline (`AF-85`).
//! Feeds raw `.cu8` or `.cf32` baseband samples into `PpmDemodulator` and emits framed Beast messages.

use aerofoil_sdr::PpmDemodulator;

use crate::reader::ReplayFrame;

/// Replays raw RF I/Q baseband samples, demodulating Mode S PPM signals into Beast frames.
#[derive(Debug, Default)]
pub struct IqDemodulatingReplayer {
    demod: PpmDemodulator,
    current_time_us: u64,
}

impl IqDemodulatingReplayer {
    /// Creates a new demodulating replayer.
    #[must_use]
    pub fn new() -> Self {
        Self {
            demod: PpmDemodulator::new(),
            current_time_us: 1_000_000,
        }
    }

    /// Demodulates raw interleaved unsigned 8-bit I/Q baseband bytes into Beast `0x33` frames.
    pub fn demodulate_cu8_to_frames(&mut self, cu8_bytes: &[u8]) -> Vec<ReplayFrame> {
        let mut frames = Vec::new();
        let mut current_time = self.current_time_us;

        self.demod.demodulate_iq(cu8_bytes, |raw_frame| {
            let frame = Self::package_beast_frame(current_time, raw_frame);
            frames.push(frame);
            current_time += 500; // Increment timestamp
        });

        self.current_time_us = current_time;
        frames
    }

    /// Packages a 14-byte Mode S payload into a Beast 0x33 frame with 0x1A escape formatting.
    fn package_beast_frame(timestamp_us: u64, payload: &[u8; 14]) -> ReplayFrame {
        let mut bytes = Vec::with_capacity(32);
        bytes.push(0x1A);
        bytes.push(0x33); // Mode S 14-byte frame

        // 6-byte MLAT timestamp
        let ts_bytes = timestamp_us.to_be_bytes();
        for &b in &ts_bytes[2..8] {
            bytes.push(b);
            if b == 0x1A {
                bytes.push(0x1A);
            }
        }

        // 1-byte signal level (e.g. 0xE0)
        let sig = 0xE0u8;
        bytes.push(sig);
        if sig == 0x1A {
            bytes.push(0x1A);
        }

        // 14 payload bytes with 0x1A escaping
        for &b in payload {
            bytes.push(b);
            if b == 0x1A {
                bytes.push(0x1A);
            }
        }

        ReplayFrame {
            timestamp_us: Some(timestamp_us),
            raw_bytes: bytes,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_iq_demodulating_replayer() {
        let mut replayer = IqDemodulatingReplayer::new();
        let expected_payload: [u8; 14] = [
            0x8D, 0x48, 0x40, 0xD6, 0x20, 0x2C, 0xC3, 0x71, 0xC3, 0x2C, 0xE0, 0x57, 0x60, 0x98,
        ];

        // Synthesize 2 Msps PPM magnitude sequence
        let mut mag = Vec::new();
        mag.extend_from_slice(&[10u16; 8]);
        // Preamble
        mag.extend_from_slice(&[
            120, 10, 120, 10, 10, 10, 10, 120, 10, 120, 10, 10, 10, 10, 10, 10,
        ]);
        // 112 bits Manchester
        for byte in expected_payload {
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
        mag.extend_from_slice(&[10u16; 16]);

        let mut iq = Vec::new();
        for &m in &mag {
            let i = 128 + (m.min(127) as u8);
            iq.push(i);
            iq.push(128);
        }

        let frames = replayer.demodulate_cu8_to_frames(&iq);
        assert_eq!(frames.len(), 1);
        let frame = &frames[0];
        assert_eq!(frame.raw_bytes[0], 0x1A);
        assert_eq!(frame.raw_bytes[1], 0x33);
        assert!(frame.raw_bytes.len() >= 23);
    }
}
