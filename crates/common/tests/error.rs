//! The decoder error model is the contract `docs/SPEC.md` Invariant 3 states.
//!
//! These are integration tests rather than in-crate unit tests on purpose: `aerofoil-common` is
//! `#![no_std]` unconditionally, and the test harness needs `std`, so the tests live in a sibling
//! crate that can link it (`AGENTS.md` §3.2).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_common::DecodeError;

#[test]
fn truncated_reports_both_lengths() {
    let err = DecodeError::Truncated {
        expected: 14,
        actual: 7,
    };
    assert_eq!(err.to_string(), "truncated frame: expected 14 bytes, got 7");
}

#[test]
fn checksum_mismatch_names_the_cause() {
    assert_eq!(
        DecodeError::ChecksumMismatch.to_string(),
        "checksum mismatch: CRC-24 syndrome is non-zero"
    );
}

#[test]
fn uncorrectable_rs_is_distinct_from_checksum() {
    assert_eq!(
        DecodeError::UncorrectableRs.to_string(),
        "uncorrectable Reed-Solomon errors"
    );
    assert_ne!(
        DecodeError::UncorrectableRs.to_string(),
        DecodeError::ChecksumMismatch.to_string()
    );
}

#[test]
fn unsupported_format_prints_hex() {
    assert_eq!(
        DecodeError::UnsupportedFormat { format: 0x1f }.to_string(),
        "unsupported format 0x1f"
    );
}

#[test]
fn invalid_field_names_field_and_value() {
    let err = DecodeError::InvalidField {
        field: "altitude_code",
        value: 0,
    };
    assert_eq!(err.to_string(), "invalid field altitude_code: 0");
}

/// Both error traits must hold: `core::error::Error` for `no_std` callers, `std::error::Error`
/// because it is a blanket re-export and consumers with `anyhow`/`thiserror` rely on it.
#[test]
fn implements_core_and_std_error() {
    fn assert_core<E: core::error::Error>(_: &E) {}
    fn assert_std<E: std::error::Error>(_: &E) {}
    assert_core(&DecodeError::ChecksumMismatch);
    assert_std(&DecodeError::ChecksumMismatch);
}

/// The error travels by value on the decode path, so it has to stay small and `Copy`.
///
/// 24 bytes on a 64-bit target: the two `usize` payloads of `Truncated` and the `&'static str` of
/// `InvalidField` set the floor, plus the discriminant. Shrinking it further would mean replacing
/// the readable field name with an enum tag, which costs more in telemetry than it saves here.
#[test]
fn error_is_cheap_to_move() {
    fn assert_copy<T: Copy>() {}
    assert_copy::<DecodeError>();
    assert!(core::mem::size_of::<DecodeError>() <= 24);
}
