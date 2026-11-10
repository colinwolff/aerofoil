#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_1090::{
    FecResult, ModeSFrame, correct_frame_long, correct_frame_short, parse_frame_filtered,
};
use aerofoil_common::{DecodeError, DenyAll};

#[test]
fn test_df17_clean_frame() {
    let mut raw = [
        0x8d, 0x40, 0x62, 0x1d, 0x58, 0xc3, 0x82, 0xd6, 0x90, 0xc8, 0xac, 0x28, 0x63, 0xa7,
    ];
    let filter = |addr| addr == 0x40621D;
    let res = correct_frame_long(&mut raw, &filter).unwrap();
    assert_eq!(res, FecResult::Clean);
}

#[test]
fn test_df17_single_bit_error_correction_all_bits() {
    let clean = [
        0x8d, 0x40, 0x62, 0x1d, 0x58, 0xc3, 0x82, 0xd6, 0x90, 0xc8, 0xac, 0x28, 0x63, 0xa7,
    ];
    let filter = |addr| addr == 0x40621D;

    // Test correcting every single bit position across the entire 112-bit frame
    for bit_idx in 0..112 {
        let mut corrupted = clean;
        corrupted[bit_idx / 8] ^= 1 << (7 - (bit_idx % 8));

        let res = match correct_frame_long(&mut corrupted, &filter) {
            Ok(r) => r,
            Err(e) => panic!("Failed at bit {bit_idx}: {e:?}"),
        };
        assert_eq!(
            res,
            FecResult::Corrected {
                bit_index: bit_idx,
                icao_address: 0x40621D,
            }
        );
        assert_eq!(
            corrupted, clean,
            "failed to restore exact bytes at bit {bit_idx}"
        );
    }
}

#[test]
fn test_df17_filter_rejection_and_rollback() {
    let clean = [
        0x8d, 0x40, 0x62, 0x1d, 0x58, 0xc3, 0x82, 0xd6, 0x90, 0xc8, 0xac, 0x28, 0x63, 0xa7,
    ];
    let mut corrupted = clean;
    corrupted[5] ^= 0x01; // flip 1 bit in ME payload
    let snapshot = corrupted;

    // Reject with DenyAll
    let err = correct_frame_long(&mut corrupted, &DenyAll).unwrap_err();
    assert_eq!(err, DecodeError::ChecksumMismatch);
    assert_eq!(corrupted, snapshot, "mutation not rolled back on DenyAll");

    // Reject with non-matching filter
    let other_filter = |addr| addr == 0x111111;
    let err2 = correct_frame_long(&mut corrupted, &other_filter).unwrap_err();
    assert_eq!(err2, DecodeError::ChecksumMismatch);
    assert_eq!(
        corrupted, snapshot,
        "mutation not rolled back on filter mismatch"
    );
}

#[test]
fn test_df17_multi_bit_error_rejected() {
    let clean = [
        0x8d, 0x40, 0x62, 0x1d, 0x58, 0xc3, 0x82, 0xd6, 0x90, 0xc8, 0xac, 0x28, 0x63, 0xa7,
    ];
    let mut corrupted = clean;
    corrupted[2] ^= 0x01; // bit 1
    corrupted[6] ^= 0x04; // bit 2

    // Even an accept-all filter must reject 2-bit error
    let accept_all = |_| true;
    let err = correct_frame_long(&mut corrupted, &accept_all).unwrap_err();
    assert_eq!(err, DecodeError::ChecksumMismatch);
}

#[test]
fn test_df11_single_bit_error_correction() {
    let clean = [0x5d, 0x48, 0x40, 0xd6, 0xf8, 0x74, 0x0f];
    let filter = |addr| addr == 0x4840D6;

    for bit_idx in 0..56 {
        let mut corrupted = clean;
        corrupted[bit_idx / 8] ^= 1 << (7 - (bit_idx % 8));

        let res = correct_frame_short(&mut corrupted, &filter).unwrap();
        assert_eq!(
            res,
            FecResult::Corrected {
                bit_index: bit_idx,
                icao_address: 0x4840D6,
            }
        );
        assert_eq!(corrupted, clean);
    }

    // DenyAll rejection
    let mut corrupted = clean;
    corrupted[1] ^= 0x02;
    assert_eq!(
        correct_frame_short(&mut corrupted, &DenyAll).unwrap_err(),
        DecodeError::ChecksumMismatch
    );
}

#[test]
fn test_parse_frame_filtered_integration() {
    let clean = [
        0x8d, 0x48, 0x40, 0xd6, 0x20, 0x2c, 0xc3, 0x71, 0xc3, 0x2c, 0xe0, 0x57, 0x60, 0x98,
    ];
    let filter = |addr| addr == 0x4840D6;

    // Clean frame
    let (frame, flipped) = parse_frame_filtered(&clean, &filter).unwrap();
    assert!(matches!(frame, ModeSFrame::ExtendedSquitter(_)));
    assert_eq!(flipped, None);

    // Corrupted bit 35 (in ME payload)
    let mut corrupted = clean;
    corrupted[4] ^= 0x10;
    let (frame2, flipped2) = parse_frame_filtered(&corrupted, &filter).unwrap();
    assert!(matches!(frame2, ModeSFrame::ExtendedSquitter(_)));
    assert_eq!(flipped2, Some(35));

    // Corrupted with DenyAll
    let err = parse_frame_filtered(&corrupted, &DenyAll).unwrap_err();
    assert_eq!(err, DecodeError::ChecksumMismatch);
}
