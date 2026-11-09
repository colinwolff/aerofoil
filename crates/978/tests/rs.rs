//! Integration tests for DO-282B $RS(48,34)$ Reed-Solomon decoder.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_978::gf::{EXP_TABLE, gf_add, gf_mul};
use aerofoil_978::rs::{
    RS_BLOCK_LEN, RS_DATA_LEN, RS_FCR, RS_PARITY_LEN, Rs48_34, decode_rs_48_34,
};
use aerofoil_common::DecodeError;

/// Generates the generator polynomial $g(x) = \prod_{i=0}^{13} (x - \alpha^{120 + i})$.
fn compute_generator_poly() -> [u8; 15] {
    let mut g = [0u8; 15];
    g[0] = 1;
    for (deg, i) in (0..RS_PARITY_LEN).enumerate() {
        let root = EXP_TABLE[RS_FCR + i];
        let mut next_g = [0u8; 15];
        for j in 0..=deg {
            next_g[j] = gf_add(next_g[j], g[j]);
            next_g[j + 1] = gf_add(next_g[j + 1], gf_mul(g[j], root));
        }
        g = next_g;
    }
    g
}

/// Encodes 34 data bytes into a valid 48-byte codeword by computing 14 parity bytes.
fn encode_rs48_34(data: &[u8; RS_DATA_LEN]) -> [u8; RS_BLOCK_LEN] {
    let g = compute_generator_poly();
    let mut codeword = [0u8; RS_BLOCK_LEN];
    codeword[..RS_DATA_LEN].copy_from_slice(data);

    for i in 0..RS_DATA_LEN {
        let lead = codeword[i];
        if lead != 0 {
            for j in 0..=RS_PARITY_LEN {
                codeword[i + j] = gf_add(codeword[i + j], gf_mul(lead, g[j]));
            }
        }
    }

    // Restore original data bytes, keeping parity remainder in the last 14 bytes
    codeword[..RS_DATA_LEN].copy_from_slice(data);
    codeword
}

#[test]
fn all_zero_codeword_reports_zero_corrections() {
    let mut frame = [0u8; RS_BLOCK_LEN];
    let res = decode_rs_48_34(&mut frame);
    assert_eq!(res, Ok(0));
    assert_eq!(frame, [0u8; RS_BLOCK_LEN]);
}

#[test]
fn clean_codeword_reports_zero_corrections() {
    let mut data = [0u8; RS_DATA_LEN];
    for (i, b) in data.iter_mut().enumerate() {
        *b = ((i * 17 + 5) & 0xFF) as u8;
    }
    let codeword = encode_rs48_34(&data);
    let mut frame = codeword;

    let res = decode_rs_48_34(&mut frame);
    assert_eq!(res, Ok(0));
    assert_eq!(frame, codeword);
}

#[test]
fn single_byte_error_at_every_position_is_corrected() {
    let mut data = [0u8; RS_DATA_LEN];
    for (i, b) in data.iter_mut().enumerate() {
        *b = ((i * 3 + 11) & 0xFF) as u8;
    }
    let codeword = encode_rs48_34(&data);

    for pos in 0..RS_BLOCK_LEN {
        let mut frame = codeword;
        frame[pos] ^= 0x5A; // inject single error

        let res = decode_rs_48_34(&mut frame);
        assert_eq!(
            res,
            Ok(1),
            "Failed to correct single error at position {pos}"
        );
        assert_eq!(
            frame, codeword,
            "Decoded frame does not match original codeword after single error at {pos}"
        );
    }
}

#[test]
fn multi_byte_errors_up_to_7_symbols_are_corrected() {
    let mut data = [0u8; RS_DATA_LEN];
    for (i, b) in data.iter_mut().enumerate() {
        *b = ((i * 31 + 42) & 0xFF) as u8;
    }
    let codeword = encode_rs48_34(&data);

    // Test correcting 1, 2, 3, 4, 5, 6, 7 errors
    let error_patterns: &[&[usize]] = &[
        &[0],
        &[5, 20],
        &[1, 15, 30],
        &[3, 10, 22, 45],
        &[0, 12, 24, 36, 47],
        &[2, 7, 14, 21, 28, 35],
        &[1, 8, 16, 24, 32, 40, 47],
    ];

    for (k_minus_1, err_indices) in error_patterns.iter().enumerate() {
        let err_count = (k_minus_1 + 1) as u8;
        let mut frame = codeword;
        for (step, &pos) in err_indices.iter().enumerate() {
            frame[pos] ^= ((step + 1) * 0x23) as u8;
        }

        let res = decode_rs_48_34(&mut frame);
        assert_eq!(
            res,
            Ok(err_count),
            "Failed correcting {err_count} errors at {err_indices:?}"
        );
        assert_eq!(
            frame, codeword,
            "Frame mismatch after correcting {err_count} errors"
        );
    }
}

#[test]
fn eight_errors_exceed_t_and_return_uncorrectable() {
    let mut data = [0u8; RS_DATA_LEN];
    for (i, b) in data.iter_mut().enumerate() {
        *b = (i as u8).wrapping_mul(7);
    }
    let codeword = encode_rs48_34(&data);

    let mut frame = codeword;
    let err_indices = [0, 4, 10, 16, 22, 28, 34, 40];
    for &pos in &err_indices {
        frame[pos] ^= 0x7F;
    }

    let res = decode_rs_48_34(&mut frame);
    assert_eq!(res, Err(DecodeError::UncorrectableRs));
}

#[test]
fn random_noise_frame_returns_uncorrectable() {
    let mut frame = [0u8; RS_BLOCK_LEN];
    for (i, b) in frame.iter_mut().enumerate() {
        *b = ((i * 137 + 19) & 0xFF) as u8;
    }
    let res = decode_rs_48_34(&mut frame);
    assert_eq!(res, Err(DecodeError::UncorrectableRs));
}

#[test]
fn struct_method_matches_free_function() {
    let mut data = [0u8; RS_DATA_LEN];
    data[0] = 42;
    let codeword = encode_rs48_34(&data);

    let mut f1 = codeword;
    let mut f2 = codeword;
    f1[12] ^= 0x99;
    f2[12] ^= 0x99;

    assert_eq!(Rs48_34::decode(&mut f1), Ok(1));
    assert_eq!(decode_rs_48_34(&mut f2), Ok(1));
    assert_eq!(f1, f2);
    assert_eq!(f1, codeword);
}
