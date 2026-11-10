//! Mode S CRC-24 polynomial division and syndrome evaluation.
//!
//! Defined in ICAO Annex 10 Vol IV and RTCA DO-260B:
//! - Generator polynomial: $G(x) = \text{0x1FFF409}$
//! - Message lengths: 56 bits (7 bytes) or 112 bits (14 bytes)
//! - Parity field: trailing 24 bits (3 bytes)
//!
//! All routines are pure, zero-allocation functions conforming to `docs/SPEC.md` Invariant 1.

mod table;

pub use table::CRC24_TABLE;

use aerofoil_common::DecodeError;

/// Mode S 24-bit generator polynomial $G(x) = \text{0x1FFF409}$.
pub const CRC24_POLYNOMIAL: u32 = 0x1FFF409;

/// Computes the 24-bit CRC remainder over an arbitrary byte slice.
///
/// Uses the precomputed 256-word table processing 8 bits per step:
/// $\text{crc} = (\text{crc} \ll 8) \oplus \text{TABLE}[(\text{crc} \gg 16) \oplus \text{byte}]$
#[must_use]
pub const fn crc24(data: &[u8]) -> u32 {
    let mut rem = 0u32;
    let mut i = 0;
    while i < data.len() {
        let b = data[i];
        let idx = (((rem >> 16) as u8) ^ b) as usize;
        rem = ((rem << 8) ^ CRC24_TABLE[idx]) & 0x00FF_FFFF;
        i += 1;
    }
    rem
}

/// Extracts the transmitted 24-bit parity from the trailing 3 bytes of a frame.
#[inline]
#[must_use]
pub const fn extract_parity_short(frame: &[u8; 7]) -> u32 {
    ((frame[4] as u32) << 16) | ((frame[5] as u32) << 8) | (frame[6] as u32)
}

/// Extracts the transmitted 24-bit parity from the trailing 3 bytes of a frame.
#[inline]
#[must_use]
pub const fn extract_parity_long(frame: &[u8; 14]) -> u32 {
    ((frame[11] as u32) << 16) | ((frame[12] as u32) << 8) | (frame[13] as u32)
}

/// Computes the 24-bit CRC syndrome for a 56-bit (7-byte) Mode S short frame.
///
/// Returns $\text{computed\_crc} \oplus \text{transmitted\_parity}$.
/// A return value of `0` indicates no bit errors for unencoded parity (DF4, DF5, DF11 broadcast).
/// For Address/Parity frames (DF0), the return value directly recovers the 24-bit ICAO address.
#[must_use]
pub const fn syndrome_short(frame: &[u8; 7]) -> u32 {
    let mut payload = [0u8; 4];
    let mut i = 0;
    while i < 4 {
        payload[i] = frame[i];
        i += 1;
    }
    let computed = crc24(&payload);
    let transmitted = extract_parity_short(frame);
    computed ^ transmitted
}

/// Computes the 24-bit CRC syndrome for a 112-bit (14-byte) Mode S long frame.
///
/// Returns $\text{computed\_crc} \oplus \text{transmitted\_parity}$.
/// A return value of `0` indicates no bit errors for pure CRC frames (DF17, DF18).
/// For Address/Parity frames (DF20, DF21), the return value recovers the overlaid identifier.
#[must_use]
pub const fn syndrome_long(frame: &[u8; 14]) -> u32 {
    let mut payload = [0u8; 11];
    let mut i = 0;
    while i < 11 {
        payload[i] = frame[i];
        i += 1;
    }
    let computed = crc24(&payload);
    let transmitted = extract_parity_long(frame);
    computed ^ transmitted
}

/// Computes the 24-bit CRC syndrome for a Mode S frame of arbitrary valid length (7 or 14 bytes).
///
/// # Errors
/// Returns [`DecodeError::Truncated`] if `frame.len() < 7`.
/// Returns [`DecodeError::InvalidField`] if `frame.len()` is neither 7 nor 14 bytes.
pub fn syndrome(frame: &[u8]) -> Result<u32, DecodeError> {
    match frame.len() {
        7 => {
            let mut buf = [0u8; 7];
            buf.copy_from_slice(frame);
            Ok(syndrome_short(&buf))
        }
        14 => {
            let mut buf = [0u8; 14];
            buf.copy_from_slice(frame);
            Ok(syndrome_long(&buf))
        }
        len if len < 7 => Err(DecodeError::Truncated {
            expected: 7,
            actual: len,
        }),
        len => Err(DecodeError::InvalidField {
            field: "frame_length",
            value: len as u32,
        }),
    }
}
