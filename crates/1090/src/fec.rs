//! Forward Error Correction (FEC) for 1090 MHz Mode S frames (`docs/SPEC.md` Invariant 5).
//!
//! Implements address-filtered single-bit error correction per `ADR-0003` and `ADR-0004`:
//! - Single-bit errors are corrected only when the recovered 24-bit ICAO address is accepted by [`AddressFilter`].
//! - Zero allocation, non-panicking, pure function hot path.
//! - Multi-bit search is excluded to prevent phantom targets.

use aerofoil_common::{AddressFilter, DecodeError};

use crate::crc::{syndrome_long, syndrome_short};

/// Generates the 112 single-bit error syndromes for 112-bit frames at compile time.
const fn compute_syndromes_112() -> [u32; 112] {
    let mut table = [0u32; 112];
    let mut i = 0;
    while i < 112 {
        let mut frame = [0u8; 14];
        frame[i / 8] |= 1 << (7 - (i % 8));
        table[i] = syndrome_long(&frame);
        i += 1;
    }
    table
}

/// Generates the 56 single-bit error syndromes for 56-bit frames at compile time.
const fn compute_syndromes_56() -> [u32; 56] {
    let mut table = [0u32; 56];
    let mut i = 0;
    while i < 56 {
        let mut frame = [0u8; 7];
        frame[i / 8] |= 1 << (7 - (i % 8));
        table[i] = syndrome_short(&frame);
        i += 1;
    }
    table
}

/// Lookup table of 112 syndromes corresponding to single-bit error vectors in a 112-bit frame.
pub const SYNDROMES_112: [u32; 112] = compute_syndromes_112();

/// Lookup table of 56 syndromes corresponding to single-bit error vectors in a 56-bit frame.
pub const SYNDROMES_56: [u32; 56] = compute_syndromes_56();

/// Result of an address-filtered error correction attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FecResult {
    /// Frame had a zero syndrome (uncorrupted); no bit flips were performed.
    Clean,
    /// Frame had a single-bit error at `bit_index` that was corrected and validated by the [`AddressFilter`].
    Corrected {
        /// Bit position (0-indexed from MSB of byte 0) that was flipped.
        bit_index: usize,
        /// Recovered 24-bit ICAO address accepted by the filter.
        icao_address: u32,
    },
}

/// Finds the bit index (0..112) of a single-bit error corresponding to `syndrome`.
///
/// Returns `None` if the syndrome is zero or does not match any single-bit error pattern.
#[must_use]
pub fn find_single_bit_error_long(syndrome: u32) -> Option<usize> {
    if syndrome == 0 {
        return None;
    }
    for (i, &s) in SYNDROMES_112.iter().enumerate() {
        if s == syndrome {
            return Some(i);
        }
    }
    None
}

/// Finds the bit index (0..56) of a single-bit error corresponding to `syndrome`.
///
/// Returns `None` if the syndrome is zero or does not match any single-bit error pattern.
#[must_use]
pub fn find_single_bit_error_short(syndrome: u32) -> Option<usize> {
    if syndrome == 0 {
        return None;
    }
    for (i, &s) in SYNDROMES_56.iter().enumerate() {
        if s == syndrome {
            return Some(i);
        }
    }
    None
}

/// Attempts address-filtered single-bit error correction on a 112-bit (14-byte) Mode S frame.
///
/// If `syndrome_long(frame) == 0`, returns `Ok(FecResult::Clean)`.
/// If the syndrome matches a single-bit error, tentatively flips the bit and checks if the
/// 24-bit ICAO address is accepted by `filter`.
/// If accepted, leaves the bit flipped and returns `Ok(FecResult::Corrected)`.
/// If rejected or uncorrectable, reverts any tentative bit flip and returns `Err(DecodeError::ChecksumMismatch)`.
pub fn correct_frame_long<F: AddressFilter + ?Sized>(
    frame: &mut [u8; 14],
    filter: &F,
) -> Result<FecResult, DecodeError> {
    let syn = syndrome_long(frame);
    if syn == 0 {
        let df = frame[0] >> 3;
        if df == 17 || df == 18 {
            return Ok(FecResult::Clean);
        }
        return Err(DecodeError::ChecksumMismatch);
    }

    let Some(bit_idx) = find_single_bit_error_long(syn) else {
        return Err(DecodeError::ChecksumMismatch);
    };

    frame[bit_idx / 8] ^= 1 << (7 - (bit_idx % 8));

    let df = frame[0] >> 3;
    if df != 17 && df != 18 {
        frame[bit_idx / 8] ^= 1 << (7 - (bit_idx % 8));
        return Err(DecodeError::ChecksumMismatch);
    }

    let icao_address = ((frame[1] as u32) << 16) | ((frame[2] as u32) << 8) | (frame[3] as u32);

    if filter.contains(icao_address) {
        Ok(FecResult::Corrected {
            bit_index: bit_idx,
            icao_address,
        })
    } else {
        frame[bit_idx / 8] ^= 1 << (7 - (bit_idx % 8));
        Err(DecodeError::ChecksumMismatch)
    }
}

/// Attempts address-filtered single-bit error correction on a 56-bit (7-byte) DF11 all-call frame.
///
/// If `syndrome_short(frame) == 0`, returns `Ok(FecResult::Clean)`.
/// If the syndrome matches a single-bit error, tentatively flips the bit and checks if the
/// 24-bit ICAO address is accepted by `filter`.
pub fn correct_frame_short<F: AddressFilter + ?Sized>(
    frame: &mut [u8; 7],
    filter: &F,
) -> Result<FecResult, DecodeError> {
    let syn = syndrome_short(frame);
    if syn == 0 {
        let df = frame[0] >> 3;
        if df == 11 {
            return Ok(FecResult::Clean);
        }
        return Err(DecodeError::ChecksumMismatch);
    }

    let Some(bit_idx) = find_single_bit_error_short(syn) else {
        return Err(DecodeError::ChecksumMismatch);
    };

    frame[bit_idx / 8] ^= 1 << (7 - (bit_idx % 8));

    let df = frame[0] >> 3;
    if df != 11 {
        frame[bit_idx / 8] ^= 1 << (7 - (bit_idx % 8));
        return Err(DecodeError::ChecksumMismatch);
    }

    let icao_address = ((frame[1] as u32) << 16) | ((frame[2] as u32) << 8) | (frame[3] as u32);

    if filter.contains(icao_address) {
        Ok(FecResult::Corrected {
            bit_index: bit_idx,
            icao_address,
        })
    } else {
        frame[bit_idx / 8] ^= 1 << (7 - (bit_idx % 8));
        Err(DecodeError::ChecksumMismatch)
    }
}
