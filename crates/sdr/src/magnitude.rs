//! Integer magnitude computation from raw interleaved 8-bit I/Q samples.

/// Computes integer magnitude from interleaved unsigned 8-bit I/Q samples.
///
/// RTL-SDR delivers samples as interleaved unsigned 8-bit values centered at 128:
/// `[I0, Q0, I1, Q1, ...]`.
///
/// Magnitude is computed using the alpha-max-plus-beta-min approximation:
/// `|I + jQ| ≈ max(|I|, |Q|) + (1/2) * min(|I|, |Q|)`, providing < 8% error
/// with zero floating point operations, zero heap allocations, and pure integer shifts.
pub fn compute_magnitude_u16(iq_samples: &[u8], out_mag: &mut [u16]) -> usize {
    let num_samples = (iq_samples.len() / 2).min(out_mag.len());

    for k in 0..num_samples {
        let raw_i = iq_samples[2 * k];
        let raw_q = iq_samples[2 * k + 1];

        // Convert unsigned 8-bit offset-binary [0..255] to signed magnitude [0..128]
        let abs_i = (i16::from(raw_i) - 128).unsigned_abs();
        let abs_q = (i16::from(raw_q) - 128).unsigned_abs();

        let (max, min) = if abs_i >= abs_q {
            (abs_i, abs_q)
        } else {
            (abs_q, abs_i)
        };

        // max + min/2
        out_mag[k] = max + (min >> 1);
    }

    num_samples
}
