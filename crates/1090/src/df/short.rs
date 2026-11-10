//! Short 56-bit (7-byte) Mode S surveillance frames: DF0, DF4, DF5, DF11.

use aerofoil_common::{Altitude, Squawk};

use super::{
    altitude::decode_ac13,
    squawk::decode_id13,
    types::{FlightStatus, TransponderCapability},
};
use crate::crc::extract_parity_short;

/// Downlink Format 0: Short Air-Air Surveillance (`docs/SPEC.md` §2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Df0ShortAirAir {
    /// Vertical status (false = airborne, true = on ground).
    pub vertical_status_ground: bool,
    /// Cross-link capability.
    pub cross_link_capability: bool,
    /// Sensitivity level (0..=7).
    pub sensitivity_level: u8,
    /// Reply information (0..=15).
    pub reply_information: u8,
    /// Barometric altitude.
    pub altitude: Option<Altitude>,
    /// 24-bit address/parity field.
    pub ap: u32,
}

impl Df0ShortAirAir {
    /// Parses a 7-byte DF0 frame.
    #[must_use]
    pub fn parse(frame: &[u8; 7]) -> Self {
        let vs = (frame[0] & 0x04) != 0;
        let cc = (frame[0] & 0x02) != 0;
        let sl = (frame[1] >> 5) & 0x07;
        let ri = (frame[1] >> 1) & 0x0F;
        let altitude = decode_ac13(frame);
        let ap = extract_parity_short(frame);

        Self {
            vertical_status_ground: vs,
            cross_link_capability: cc,
            sensitivity_level: sl,
            reply_information: ri,
            altitude,
            ap,
        }
    }
}

/// Downlink Format 4: Surveillance Altitude Reply (`docs/SPEC.md` §2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Df4AltReply {
    /// Flight status (alert, ground condition, SPI).
    pub flight_status: FlightStatus,
    /// Downlink request (0..=31).
    pub downlink_request: u8,
    /// Utility message (0..=63).
    pub utility_message: u8,
    /// Barometric altitude.
    pub altitude: Option<Altitude>,
    /// 24-bit address/parity field.
    pub ap: u32,
}

impl Df4AltReply {
    /// Parses a 7-byte DF4 frame.
    #[must_use]
    pub fn parse(frame: &[u8; 7]) -> Self {
        let fs = FlightStatus::from_raw(frame[0]);
        let dr = (frame[1] >> 3) & 0x1F;
        let um = ((frame[1] & 0x07) << 3) | ((frame[2] >> 5) & 0x07);
        let altitude = decode_ac13(frame);
        let ap = extract_parity_short(frame);

        Self {
            flight_status: fs,
            downlink_request: dr,
            utility_message: um,
            altitude,
            ap,
        }
    }
}

/// Downlink Format 5: Surveillance Identity Reply (`docs/SPEC.md` §2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Df5IdentityReply {
    /// Flight status (alert, ground condition, SPI).
    pub flight_status: FlightStatus,
    /// Downlink request (0..=31).
    pub downlink_request: u8,
    /// Utility message (0..=63).
    pub utility_message: u8,
    /// Mode A squawk code.
    pub squawk: Option<Squawk>,
    /// 24-bit address/parity field.
    pub ap: u32,
}

impl Df5IdentityReply {
    /// Parses a 7-byte DF5 frame.
    #[must_use]
    pub fn parse(frame: &[u8; 7]) -> Self {
        let fs = FlightStatus::from_raw(frame[0]);
        let dr = (frame[1] >> 3) & 0x1F;
        let um = ((frame[1] & 0x07) << 3) | ((frame[2] >> 5) & 0x07);
        let squawk = decode_id13(frame);
        let ap = extract_parity_short(frame);

        Self {
            flight_status: fs,
            downlink_request: dr,
            utility_message: um,
            squawk,
            ap,
        }
    }
}

/// Downlink Format 11: All-Call Reply (`docs/SPEC.md` §2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Df11AllCallReply {
    /// Transponder capability.
    pub capability: TransponderCapability,
    /// 24-bit ICAO aircraft address.
    pub address: u32,
    /// 24-bit parity / interrogator identifier.
    pub pi: u32,
}

impl Df11AllCallReply {
    /// Parses a 7-byte DF11 frame.
    #[must_use]
    pub fn parse(frame: &[u8; 7]) -> Self {
        let ca = TransponderCapability::from_raw(frame[0]);
        let address = ((frame[1] as u32) << 16) | ((frame[2] as u32) << 8) | (frame[3] as u32);
        let pi = extract_parity_short(frame);

        Self {
            capability: ca,
            address,
            pi,
        }
    }
}
