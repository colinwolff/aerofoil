//! 978 MHz Universal Access Transceiver (UAT) 4-FSK FM discriminator.

/// Discriminate instantaneous frequency from interleaved I/Q samples using cross-product FM demodulation.
///
/// For successive complex samples `S[k] = I[k] + j Q[k]` and `S[k-1] = I[k-1] + j Q[k-1]`:
/// The phase difference is proportional to `Im(S[k] * conj(S[k-1])) = Q[k]*I[k-1] - I[k]*Q[k-1]`.
///
/// Returns the number of output discriminator values generated.
pub fn discriminate_fsk4(iq_samples: &[u8], out_discrim: &mut [i32]) -> usize {
    let num_samples = iq_samples.len() / 2;
    if num_samples < 2 || out_discrim.is_empty() {
        return 0;
    }

    let limit = (num_samples - 1).min(out_discrim.len());

    let mut prev_i = i32::from(iq_samples[0]) - 128;
    let mut prev_q = i32::from(iq_samples[1]) - 128;

    for k in 0..limit {
        let curr_i = i32::from(iq_samples[2 * (k + 1)]) - 128;
        let curr_q = i32::from(iq_samples[2 * (k + 1) + 1]) - 128;

        // Cross-product: Q[k] * I[k-1] - I[k] * Q[k-1]
        let cross = (curr_q * prev_i) - (curr_i * prev_q);
        out_discrim[k] = cross;

        prev_i = curr_i;
        prev_q = curr_q;
    }

    limit
}
