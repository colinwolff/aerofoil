//! Mode S 1090 MHz Pulse Position Modulation (PPM) preamble correlator.

/// Length of the standard Mode S preamble pattern in samples (16 half-microsecond samples at 2 Msps).
pub const PREAMBLE_LEN_SAMPLES: usize = 16;

/// Correlates a 16-sample window against the Mode S 8-microsecond PPM preamble.
///
/// In Mode S, the preamble consists of 4 pulses:
/// - Pulse 1: 0.0 to 0.5 µs (sample 0)
/// - Pulse 2: 1.0 to 1.5 µs (sample 2)
/// - Pulse 3: 3.5 to 4.0 µs (sample 7)
/// - Pulse 4: 4.5 to 5.0 µs (sample 9)
///
/// Samples 1, 3, 4, 5, 6, 8, 10, 11, 12, 13, 14, 15 are quiet intervals.
/// Returns the correlation score if a valid preamble is detected, or `None`.
#[must_use]
pub fn correlate_preamble(mag: &[u16]) -> Option<u32> {
    if mag.len() < PREAMBLE_LEN_SAMPLES {
        return None;
    }

    // High pulses
    let p0 = u32::from(mag[0]);
    let p2 = u32::from(mag[2]);
    let p7 = u32::from(mag[7]);
    let p9 = u32::from(mag[9]);

    // Low valleys
    let p1 = u32::from(mag[1]);
    let p3 = u32::from(mag[3]);
    let p4 = u32::from(mag[4]);
    let p5 = u32::from(mag[5]);
    let p6 = u32::from(mag[6]);
    let p8 = u32::from(mag[8]);

    // High pulses must exceed their adjacent valleys
    if p0 <= p1 || p2 <= p1 || p2 <= p3 || p7 <= p6 || p7 <= p8 || p9 <= p8 {
        return None;
    }

    let high_sum = p0 + p2 + p7 + p9;
    let low_sum = p1 + p3 + p4 + p5 + p6 + p8;

    // Minimum signal energy requirement
    if high_sum < 60 {
        return None;
    }

    // High energy must comfortably exceed the low energy baseline
    if high_sum > (low_sum * 3 / 2) {
        Some(high_sum - low_sum)
    } else {
        None
    }
}
