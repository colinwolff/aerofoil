//! UAT frame geometry validation, de-interleaving, and assembly.
//!
//! RTCA DO-282B specifies systematic Reed-Solomon framing and interleaving over the RF channel.
//!
//! Invariant 8 (`docs/SPEC.md`):
//! - UAT downlink bytes are transmitted interleaved across four message phases and are
//!   de-interleaved before syndrome computation via a fixed permutation.
//! - Payload type code and Reed-Solomon geometry must agree before FEC is attempted.
//! - Successfully corrected frames report `corrected_symbols: u8`.

use aerofoil_common::DecodeError;

use crate::rs::{RS_BLOCK_LEN, RS_DATA_LEN, RS_MAX_CORRECTABLE, decode_rs_48_34};

/// UAT frame classification by payload type and Reed-Solomon geometry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UatFrameKind {
    /// Basic ADS-B downlink message: 18 payload bytes + 12 parity bytes = 30 bytes ($RS(30,18)$).
    Basic,
    /// Long ADS-B downlink message: 34 payload bytes + 14 parity bytes = 48 bytes ($RS(48,34)$).
    Long,
    /// Ground uplink message: 432 payload bytes + 120 parity bytes = 552 bytes ($6 \times RS(92,72)$).
    Uplink,
}

/// A validated, de-interleaved, and error-corrected UAT Long downlink frame.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UatDownlinkFrame {
    payload: [u8; RS_DATA_LEN],
    corrected_symbols: u8,
}

impl UatDownlinkFrame {
    /// De-interleaves, validates geometry, and FEC-corrects a raw 48-byte UAT frame.
    ///
    /// In accordance with `docs/SPEC.md` Invariant 8:
    /// - Reverses the 4-phase transmission interleaving before syndrome evaluation.
    /// - Rejects geometry / payload type mismatches with [`DecodeError::InvalidField`] *before* FEC.
    /// - Performs $RS(48,34)$ error correction in-place and records `corrected_symbols`.
    pub fn decode_long(interleaved: &[u8; RS_BLOCK_LEN]) -> Result<Self, DecodeError> {
        let mut deinterleaved = deinterleave_downlink(interleaved);

        // Byte 0 bits 7..3 contain the 5-bit Payload Type Code
        let payload_type = deinterleaved[0] >> 3;
        if payload_type != 1 {
            return Err(DecodeError::InvalidField {
                field: "payload_type",
                value: payload_type as u32,
            });
        }

        let corrected_symbols = decode_rs_48_34(&mut deinterleaved)?;
        debug_assert!(corrected_symbols as usize <= RS_MAX_CORRECTABLE);

        let mut payload = [0u8; RS_DATA_LEN];
        payload.copy_from_slice(&deinterleaved[..RS_DATA_LEN]);

        Ok(Self {
            payload,
            corrected_symbols,
        })
    }

    /// Returns the 34-byte corrected payload.
    #[inline]
    #[must_use]
    pub const fn payload(&self) -> &[u8; RS_DATA_LEN] {
        &self.payload
    }

    /// Number of Reed-Solomon symbol errors corrected in this frame (0..=7).
    #[inline]
    #[must_use]
    pub const fn corrected_symbols(&self) -> u8 {
        self.corrected_symbols
    }

    /// 5-bit Payload Type Code (bits 7..3 of byte 0).
    #[inline]
    #[must_use]
    pub const fn payload_type(&self) -> u8 {
        self.payload[0] >> 3
    }

    /// 3-bit Address Qualifier (bits 2..0 of byte 0).
    #[inline]
    #[must_use]
    pub const fn address_qualifier(&self) -> u8 {
        self.payload[0] & 0x07
    }

    /// 24-bit ICAO or anonymous transponder address (bytes 1..=3).
    #[inline]
    #[must_use]
    pub const fn address(&self) -> u32 {
        ((self.payload[1] as u32) << 16)
            | ((self.payload[2] as u32) << 8)
            | (self.payload[3] as u32)
    }
}

/// De-interleaves a 48-byte downlink frame transmitted across 4 message phases.
///
/// Phase $p \in 0..4$ carries 12 symbols $i \in 0..12$ where symbol $k = 4i + p$.
#[must_use]
pub fn deinterleave_downlink(interleaved: &[u8; RS_BLOCK_LEN]) -> [u8; RS_BLOCK_LEN] {
    let mut out = [0u8; RS_BLOCK_LEN];
    for p in 0..4 {
        for i in 0..12 {
            out[i * 4 + p] = interleaved[p * 12 + i];
        }
    }
    out
}

/// Interleaves a 48-byte downlink frame across 4 message phases.
///
/// Inverse of [`deinterleave_downlink`].
#[must_use]
pub fn interleave_downlink(src: &[u8; RS_BLOCK_LEN]) -> [u8; RS_BLOCK_LEN] {
    let mut out = [0u8; RS_BLOCK_LEN];
    for p in 0..4 {
        for i in 0..12 {
            out[p * 12 + i] = src[i * 4 + p];
        }
    }
    out
}

/// De-interleaves a 552-byte ground uplink frame of 6 interleaved $RS(92,72)$ blocks.
///
/// The transmitter sends column-by-column across 92 columns of 6 rows.
#[must_use]
pub fn deinterleave_uplink(interleaved: &[u8; 552]) -> [u8; 552] {
    let mut out = [0u8; 552];
    for col in 0..92 {
        for row in 0..6 {
            out[row * 92 + col] = interleaved[col * 6 + row];
        }
    }
    out
}

/// Interleaves a 552-byte ground uplink frame of 6 $RS(92,72)$ blocks.
///
/// Inverse of [`deinterleave_uplink`].
#[must_use]
pub fn interleave_uplink(src: &[u8; 552]) -> [u8; 552] {
    let mut out = [0u8; 552];
    for col in 0..92 {
        for row in 0..6 {
            out[col * 6 + row] = src[row * 92 + col];
        }
    }
    out
}
