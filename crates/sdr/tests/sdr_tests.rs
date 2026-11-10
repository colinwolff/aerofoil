//! Unit and integration tests for `aerofoil-sdr`.

use std::time::Instant;

use aerofoil_sdr::{
    DspBenchmarkResult, PREAMBLE_LEN_SAMPLES, compute_magnitude_u16, correlate_preamble,
    discriminate_fsk4,
};

#[test]
fn test_magnitude_computation_accuracy() {
    // Zero offset (128, 128) in offset binary corresponds to (0, 0) in signed I/Q
    let iq = [128, 128, 228, 128, 128, 228, 228, 228];
    let mut mag = [0u16; 4];

    let count = compute_magnitude_u16(&iq, &mut mag);
    assert_eq!(count, 4);

    assert_eq!(mag[0], 0); // 0 + 0 = 0
    assert_eq!(mag[1], 100); // 100 + 0 = 100
    assert_eq!(mag[2], 100); // 100 + 0 = 100
    assert_eq!(mag[3], 150); // 100 + 100/2 = 150
}

#[test]
fn test_ppm_preamble_correlation() {
    let noise = [10u16; PREAMBLE_LEN_SAMPLES];
    assert_eq!(correlate_preamble(&noise), None);

    // Build synthetic Mode S preamble: pulses at 0, 2, 7, 9
    let mut preamble = [5u16; PREAMBLE_LEN_SAMPLES];
    preamble[0] = 100;
    preamble[2] = 100;
    preamble[7] = 100;
    preamble[9] = 100;

    let score = correlate_preamble(&preamble);
    assert!(score.is_some());
    let Ok(val) = score.ok_or("no score") else {
        panic!("expected score");
    };
    assert!(val > 300);
}

#[test]
fn test_fsk4_discrimination() {
    // Synthesize a rotating complex vector: (1, 0), (0, 1), (-1, 0), (0, -1) -> +90 deg per sample
    let iq_pos = [228, 128, 128, 228, 28, 128, 128, 28];
    let mut discrim = [0i32; 3];

    let n = discriminate_fsk4(&iq_pos, &mut discrim);
    assert_eq!(n, 3);
    for &d in &discrim {
        assert!(d > 0, "positive frequency shift must yield positive output");
    }

    // Synthesize opposite rotation: (1, 0), (0, -1), (-1, 0), (0, 1) -> -90 deg per sample
    let iq_neg = [228, 128, 128, 28, 28, 128, 128, 228];
    discriminate_fsk4(&iq_neg, &mut discrim);
    for &d in &discrim {
        assert!(d < 0, "negative frequency shift must yield negative output");
    }
}

#[test]
fn test_dsp_throughput_spike_viability() {
    const NUM_SAMPLES: usize = 240_000; // 100 ms of 2.4 Msps stream
    let iq_data = vec![140u8; NUM_SAMPLES * 2];
    let mut mag_buf = vec![0u16; NUM_SAMPLES];

    let start = Instant::now();
    let processed = compute_magnitude_u16(&iq_data, &mut mag_buf);
    let elapsed = start.elapsed();

    assert_eq!(processed, NUM_SAMPLES);
    let result = DspBenchmarkResult::compute(NUM_SAMPLES, elapsed);

    // Viability check: 2.4 Msps budget requires < 416 ns per sample
    assert!(
        result.is_viable_dual_band_multi_core(),
        "Throughput {:.2} Msps ({:.1} ns/sample) must satisfy 2.4 Msps budget",
        result.msps,
        result.ns_per_sample
    );
}
