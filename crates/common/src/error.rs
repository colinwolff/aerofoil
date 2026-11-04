//! The decoder error model (`docs/SPEC.md` Invariant 3).
//!
//! Every variant is a *rejection*, never a repair. A decoder either decodes a frame as the
//! specification says, or it reports one of these; clamping a value into a plausible range or
//! guessing an unknown format is forbidden (`docs/SPEC.md` Invariant 2 and §6).

use core::fmt;

/// Why a frame could not be decoded.
///
/// `Display` writes into the caller's formatter without touching the heap, so formatting an error
/// costs nothing on a `no_std` target.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum DecodeError {
    /// The input is shorter than the frame length its header implies.
    Truncated {
        /// Bytes the header requires.
        expected: usize,
        /// Bytes actually supplied.
        actual: usize,
    },
    /// The CRC-24 syndrome is non-zero and no correction applied.
    ///
    /// With an `AddressFilter` that accepts the corrected address this variant is never returned
    /// for a single-bit error (`ADR-0003`, `ADR-0004`).
    ChecksumMismatch,
    /// Reed-Solomon syndromes yielded no valid error locator: more errors than `t`.
    UncorrectableRs,
    /// A well-formed frame carrying a format this build does not implement.
    ///
    /// Callers discard it silently; an unlisted downlink format is not evidence of anything.
    UnsupportedFormat {
        /// The raw format code, as read from the frame.
        format: u8,
    },
    /// A field value outside the domain the specification allows.
    InvalidField {
        /// Field name, for telemetry and tests.
        field: &'static str,
        /// The rejected value, widened so one variant covers every field width.
        value: u32,
    },
}

impl fmt::Display for DecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::Truncated { expected, actual } => {
                write!(
                    f,
                    "truncated frame: expected {expected} bytes, got {actual}"
                )
            }
            Self::ChecksumMismatch => f.write_str("checksum mismatch: CRC-24 syndrome is non-zero"),
            Self::UncorrectableRs => f.write_str("uncorrectable Reed-Solomon errors"),
            Self::UnsupportedFormat { format } => write!(f, "unsupported format {format:#04x}"),
            Self::InvalidField { field, value } => write!(f, "invalid field {field}: {value}"),
        }
    }
}

impl core::error::Error for DecodeError {}
