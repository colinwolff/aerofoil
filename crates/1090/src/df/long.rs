//! Long 112-bit (14-byte) Comm-B surveillance frames: DF20, DF21.

use aerofoil_common::{Altitude, Squawk};

use super::{altitude::decode_ac13, squawk::decode_id13, types::FlightStatus};
use crate::crc::extract_parity_long;

/// Downlink Format 20: Comm-B Altitude Reply (`docs/SPEC.md` §2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Df20CommBAlt {
    /// Flight status (alert, ground condition, SPI).
    pub flight_status: FlightStatus,
    /// Downlink request (0..=31).
    pub downlink_request: u8,
    /// Utility message (0..=63).
    pub utility_message: u8,
    /// Barometric altitude.
    pub altitude: Option<Altitude>,
    /// 56-bit Comm-B message payload.
    pub mb: [u8; 7],
    /// 24-bit data parity field.
    pub dp: u32,
}

impl Df20CommBAlt {
    /// Parses a 14-byte DF20 frame.
    #[must_use]
    pub fn parse(frame: &[u8; 14]) -> Self {
        let fs = FlightStatus::from_raw(frame[0]);
        let dr = (frame[1] >> 3) & 0x1F;
        let um = ((frame[1] & 0x07) << 3) | ((frame[2] >> 5) & 0x07);
        let altitude = decode_ac13(frame);

        let mut mb = [0u8; 7];
        mb.copy_from_slice(&frame[4..11]);

        let dp = extract_parity_long(frame);

        Self {
            flight_status: fs,
            downlink_request: dr,
            utility_message: um,
            altitude,
            mb,
            dp,
        }
    }
}

/// Downlink Format 21: Comm-B Identity Reply (`docs/SPEC.md` §2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Df21CommBId {
    /// Flight status (alert, ground condition, SPI).
    pub flight_status: FlightStatus,
    /// Downlink request (0..=31).
    pub downlink_request: u8,
    /// Utility message (0..=63).
    pub utility_message: u8,
    /// Mode A squawk code.
    pub squawk: Option<Squawk>,
    /// 56-bit Comm-B message payload.
    pub mb: [u8; 7],
    /// 24-bit data parity field.
    pub dp: u32,
}

impl Df21CommBId {
    /// Parses a 14-byte DF21 frame.
    #[must_use]
    pub fn parse(frame: &[u8; 14]) -> Self {
        let fs = FlightStatus::from_raw(frame[0]);
        let dr = (frame[1] >> 3) & 0x1F;
        let um = ((frame[1] & 0x07) << 3) | ((frame[2] >> 5) & 0x07);
        let squawk = decode_id13(frame);

        let mut mb = [0u8; 7];
        mb.copy_from_slice(&frame[4..11]);

        let dp = extract_parity_long(frame);

        Self {
            flight_status: fs,
            downlink_request: dr,
            utility_message: um,
            squawk,
            mb,
            dp,
        }
    }
}
