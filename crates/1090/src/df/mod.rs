//! Mode S Downlink Format (DF) frame definitions and parsers.
//!
//! Follows ICAO Annex 10 Vol IV and RTCA DO-260B (`docs/SPEC.md` §2 and Invariant 6).
//! Bitfield decoding operates on borrowed byte slices without dynamic allocation.

pub mod altitude;
pub mod es;
pub mod long;
pub mod short;
pub mod squawk;
pub mod types;

pub use es::{
    AirbornePosition, AirborneVelocity, AircraftIdentification, EsPayload, ExtendedSquitter,
    SurfacePosition, VelocityPayload, VerticalRateSource,
};
pub use long::{Df20CommBAlt, Df21CommBId};
pub use short::{Df0ShortAirAir, Df4AltReply, Df5IdentityReply, Df11AllCallReply};
pub use types::{FlightStatus, SurveillanceStatus, TransponderCapability};

use aerofoil_common::{AddressFilter, DecodeError};

use crate::fec::{FecResult, correct_frame_long, correct_frame_short};

/// A decoded Mode S surveillance frame.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModeSFrame {
    /// DF0: Short Air-Air Surveillance (56 bits).
    ShortAirAir(Df0ShortAirAir),
    /// DF4: Surveillance Altitude Reply (56 bits).
    AltitudeReply(Df4AltReply),
    /// DF5: Surveillance Identity Reply (56 bits).
    IdentityReply(Df5IdentityReply),
    /// DF11: All-Call Reply (56 bits).
    AllCallReply(Df11AllCallReply),
    /// DF17 / DF18: 1090ES Extended Squitter (112 bits).
    ExtendedSquitter(ExtendedSquitter),
    /// DF20: Comm-B Altitude Reply (112 bits).
    CommBAltitude(Df20CommBAlt),
    /// DF21: Comm-B Identity Reply (112 bits).
    CommBIdentity(Df21CommBId),
}

/// Parses a 56-bit (7-byte) short Mode S frame into a [`ModeSFrame`].
pub fn parse_frame_short(bytes: &[u8; 7]) -> Result<ModeSFrame, DecodeError> {
    let df = bytes[0] >> 3;
    match df {
        0 => Ok(ModeSFrame::ShortAirAir(Df0ShortAirAir::parse(bytes))),
        4 => Ok(ModeSFrame::AltitudeReply(Df4AltReply::parse(bytes))),
        5 => Ok(ModeSFrame::IdentityReply(Df5IdentityReply::parse(bytes))),
        11 => Ok(ModeSFrame::AllCallReply(Df11AllCallReply::parse(bytes))),
        _ => Err(DecodeError::UnsupportedFormat { format: df }),
    }
}

/// Parses a 112-bit (14-byte) long Mode S frame into a [`ModeSFrame`].
pub fn parse_frame_long(bytes: &[u8; 14]) -> Result<ModeSFrame, DecodeError> {
    let df = bytes[0] >> 3;
    match df {
        17 | 18 => Ok(ModeSFrame::ExtendedSquitter(ExtendedSquitter::parse(
            bytes,
        )?)),
        20 => Ok(ModeSFrame::CommBAltitude(Df20CommBAlt::parse(bytes))),
        21 => Ok(ModeSFrame::CommBIdentity(Df21CommBId::parse(bytes))),
        _ => Err(DecodeError::UnsupportedFormat { format: df }),
    }
}

/// Parses any Mode S frame (56-bit or 112-bit) into a [`ModeSFrame`].
pub fn parse_frame(bytes: &[u8]) -> Result<ModeSFrame, DecodeError> {
    match bytes.len() {
        7 => {
            let mut arr = [0u8; 7];
            arr.copy_from_slice(bytes);
            parse_frame_short(&arr)
        }
        14 => {
            let mut arr = [0u8; 14];
            arr.copy_from_slice(bytes);
            parse_frame_long(&arr)
        }
        len => {
            let expected = if bytes.first().is_some_and(|b| (b >> 3) >= 16) {
                14
            } else {
                7
            };
            Err(DecodeError::Truncated {
                expected,
                actual: len,
            })
        }
    }
}

/// Parses a Mode S frame, applying address-filtered error correction if single-bit corruption occurred.
///
/// Returns `Ok((frame, None))` if the frame was clean.
/// Returns `Ok((frame, Some(bit_index)))` if a single-bit error was corrected and validated against `filter`.
/// Returns `Err(DecodeError::ChecksumMismatch)` if corrupted and not validated by `filter`.
pub fn parse_frame_filtered<F: AddressFilter + ?Sized>(
    bytes: &[u8],
    filter: &F,
) -> Result<(ModeSFrame, Option<usize>), DecodeError> {
    match bytes.len() {
        7 => {
            let mut arr = [0u8; 7];
            arr.copy_from_slice(bytes);
            let df = arr[0] >> 3;
            let bit_flipped = if df == 11 {
                match correct_frame_short(&mut arr, filter)? {
                    FecResult::Clean => None,
                    FecResult::Corrected { bit_index, .. } => Some(bit_index),
                }
            } else {
                None
            };
            let frame = parse_frame_short(&arr)?;
            Ok((frame, bit_flipped))
        }
        14 => {
            let mut arr = [0u8; 14];
            arr.copy_from_slice(bytes);
            let df = arr[0] >> 3;
            let bit_flipped = if df == 17 || df == 18 {
                match correct_frame_long(&mut arr, filter)? {
                    FecResult::Clean => None,
                    FecResult::Corrected { bit_index, .. } => Some(bit_index),
                }
            } else {
                None
            };
            let frame = parse_frame_long(&arr)?;
            Ok((frame, bit_flipped))
        }
        len => {
            let expected = if bytes.first().is_some_and(|b| (b >> 3) >= 16) {
                14
            } else {
                7
            };
            Err(DecodeError::Truncated {
                expected,
                actual: len,
            })
        }
    }
}
