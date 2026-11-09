//! Integration tests for UAT framing, de-interleaving, and geometry validation.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_978::frame::{
    UatDownlinkFrame, deinterleave_downlink, deinterleave_uplink, interleave_downlink,
    interleave_uplink,
};
use aerofoil_978::gf::{EXP_TABLE, gf_add, gf_mul};
use aerofoil_978::rs::{RS_BLOCK_LEN, RS_DATA_LEN, RS_FCR, RS_PARITY_LEN};
use aerofoil_common::DecodeError;

/// Helper: computes the RS generator polynomial.
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

/// Helper: encodes 34 payload bytes into a 48-byte codeword.
fn encode_downlink(payload: &[u8; RS_DATA_LEN]) -> [u8; RS_BLOCK_LEN] {
    let g = compute_generator_poly();
    let mut codeword = [0u8; RS_BLOCK_LEN];
    codeword[..RS_DATA_LEN].copy_from_slice(payload);

    for i in 0..RS_DATA_LEN {
        let lead = codeword[i];
        if lead != 0 {
            for j in 0..=RS_PARITY_LEN {
                codeword[i + j] = gf_add(codeword[i + j], gf_mul(lead, g[j]));
            }
        }
    }
    codeword[..RS_DATA_LEN].copy_from_slice(payload);
    codeword
}

#[test]
fn downlink_interleaving_is_bijective_and_exact_inverse() {
    let mut original = [0u8; RS_BLOCK_LEN];
    for (i, b) in original.iter_mut().enumerate() {
        *b = (i * 7 + 3) as u8;
    }

    let interleaved = interleave_downlink(&original);
    assert_ne!(
        interleaved, original,
        "Interleaved data must be permuted from original"
    );

    let deinterleaved = deinterleave_downlink(&interleaved);
    assert_eq!(
        deinterleaved, original,
        "De-interleaving must perfectly restore original frame"
    );
}

#[test]
fn uplink_interleaving_is_bijective_and_exact_inverse() {
    let mut original = [0u8; 552];
    for (i, b) in original.iter_mut().enumerate() {
        *b = ((i * 13 + 37) & 0xFF) as u8;
    }

    let interleaved = interleave_uplink(&original);
    assert_ne!(interleaved, original);

    let deinterleaved = deinterleave_uplink(&interleaved);
    assert_eq!(deinterleaved, original);
}

#[test]
fn valid_long_frame_decodes_cleanly() {
    let mut payload = [0u8; RS_DATA_LEN];
    // Payload Type Code = 1 (bits 7..3 of byte 0: 0x08), Address Qualifier = 2 (bits 2..0: 0x02)
    payload[0] = (1 << 3) | 2;
    // 24-bit ICAO address: 0xA1B2C3
    payload[1] = 0xA1;
    payload[2] = 0xB2;
    payload[3] = 0xC3;
    for (i, b) in payload.iter_mut().enumerate().skip(4) {
        *b = (i * 5) as u8;
    }

    let codeword = encode_downlink(&payload);
    let interleaved = interleave_downlink(&codeword);

    let frame = UatDownlinkFrame::decode_long(&interleaved).unwrap();
    assert_eq!(frame.corrected_symbols(), 0);
    assert_eq!(frame.payload_type(), 1);
    assert_eq!(frame.address_qualifier(), 2);
    assert_eq!(frame.address(), 0xA1B2C3);
    assert_eq!(frame.payload(), &payload);
}

#[test]
fn burst_errors_dispersed_by_deinterleaving_and_corrected() {
    let mut payload = [0u8; RS_DATA_LEN];
    payload[0] = 1 << 3; // Payload Type Code = 1
    payload[1] = 0x12;
    payload[2] = 0x34;
    payload[3] = 0x56;

    let codeword = encode_downlink(&payload);
    let mut interleaved = interleave_downlink(&codeword);

    // Inject a contiguous 4-byte burst error over the air
    interleaved[10] ^= 0xFF;
    interleaved[11] ^= 0xAA;
    interleaved[12] ^= 0x55;
    interleaved[13] ^= 0x33;

    let frame = UatDownlinkFrame::decode_long(&interleaved).unwrap();
    assert_eq!(frame.corrected_symbols(), 4);
    assert_eq!(frame.payload(), &payload);
    assert_eq!(frame.address(), 0x123456);
}

#[test]
fn payload_geometry_mismatch_rejected_before_fec() {
    let mut payload = [0u8; RS_DATA_LEN];
    // Payload Type Code = 0 (Basic format, which expects 30 bytes, not 48 bytes)
    payload[0] = 0 << 3;

    let codeword = encode_downlink(&payload);
    let interleaved = interleave_downlink(&codeword);

    let err = UatDownlinkFrame::decode_long(&interleaved).unwrap_err();
    assert_eq!(
        err,
        DecodeError::InvalidField {
            field: "payload_type",
            value: 0,
        }
    );

    // Also test another invalid payload type code (e.g. 5)
    let mut payload5 = [0u8; RS_DATA_LEN];
    payload5[0] = 5 << 3;
    let codeword5 = encode_downlink(&payload5);
    let interleaved5 = interleave_downlink(&codeword5);
    let err5 = UatDownlinkFrame::decode_long(&interleaved5).unwrap_err();
    assert_eq!(
        err5,
        DecodeError::InvalidField {
            field: "payload_type",
            value: 5,
        }
    );
}

#[test]
fn uncorrectable_frame_returns_typed_error() {
    let mut payload = [0u8; RS_DATA_LEN];
    payload[0] = 1 << 3; // Payload Type Code = 1

    let codeword = encode_downlink(&payload);
    let mut interleaved = interleave_downlink(&codeword);

    // Corrupt 8 distinct phases/positions exceeding t=7, leaving byte 0 (payload_type) intact
    for i in 1..=8 {
        interleaved[i * 4] ^= 0x99;
    }

    let res = UatDownlinkFrame::decode_long(&interleaved);
    assert_eq!(res, Err(DecodeError::UncorrectableRs));
}
