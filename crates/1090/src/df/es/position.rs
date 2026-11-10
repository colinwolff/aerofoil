//! Airborne & Surface Position Extended Squitter payloads (`docs/SPEC.md` Invariant 9).

use aerofoil_common::{Altitude, Heading};

use crate::df::{altitude::decode_ac12, types::SurveillanceStatus};

/// Airborne position payload (TC 9..=18).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AirbornePosition {
    /// Extended Squitter type code (9..=18).
    pub type_code: u8,
    /// Surveillance status.
    pub surveillance_status: SurveillanceStatus,
    /// Navigation Integrity Category supplement-B.
    pub nic_supplement: u8,
    /// Decoded altitude.
    pub altitude: Option<Altitude>,
    /// UTC synchronization time flag (true = synced to 0.2s UTC epoch).
    pub time_flag: bool,
    /// CPR parity flag (false = Even, true = Odd).
    pub cpr_odd: bool,
    /// 17-bit Compact Position Reporting latitude ($0 \le \text{lat} < 131072$).
    pub lat_cpr: u32,
    /// 17-bit Compact Position Reporting longitude ($0 \le \text{lon} < 131072$).
    pub lon_cpr: u32,
}

impl AirbornePosition {
    /// Parses an Airborne Position payload from a 7-byte ME field.
    #[must_use]
    pub fn parse(me: &[u8; 7]) -> Self {
        let tc = me[0] >> 3;
        let ss = SurveillanceStatus::from_raw((me[0] >> 1) & 0x03);
        let nic_b = me[0] & 0x01;

        let raw_alt = ((me[1] as u16) << 4) | ((me[2] as u16) >> 4);
        let altitude = decode_ac12(raw_alt);

        let time_flag = (me[2] & 0x08) != 0;
        let cpr_odd = (me[2] & 0x04) != 0;

        let lat_cpr =
            ((((me[2] & 0x03) as u32) << 15) | ((me[3] as u32) << 7) | ((me[4] as u32) >> 1))
                & 0x0001_FFFF;

        let lon_cpr = ((((me[4] & 0x01) as u32) << 16) | ((me[5] as u32) << 8) | (me[6] as u32))
            & 0x0001_FFFF;

        Self {
            type_code: tc,
            surveillance_status: ss,
            nic_supplement: nic_b,
            altitude,
            time_flag,
            cpr_odd,
            lat_cpr,
            lon_cpr,
        }
    }
}

/// Surface position payload (TC 5..=8).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SurfacePosition {
    /// Extended Squitter type code (5..=8).
    pub type_code: u8,
    /// Movement speed code (0..=127).
    pub movement: u8,
    /// Ground track angle, if valid.
    pub heading: Option<Heading>,
    /// UTC synchronization time flag.
    pub time_flag: bool,
    /// CPR parity flag (false = Even, true = Odd).
    pub cpr_odd: bool,
    /// 17-bit Compact Position Reporting latitude.
    pub lat_cpr: u32,
    /// 17-bit Compact Position Reporting longitude.
    pub lon_cpr: u32,
}

impl SurfacePosition {
    /// Parses a Surface Position payload from a 7-byte ME field.
    #[must_use]
    pub fn parse(me: &[u8; 7]) -> Self {
        let tc = me[0] >> 3;
        let movement = ((me[0] & 0x07) << 4) | (me[1] >> 4);

        let ground_track_valid = (me[1] & 0x08) != 0;
        let heading = if ground_track_valid {
            let raw_7bit = (((me[1] & 0x07) as u32) << 4) | ((me[2] as u32) >> 4);
            // 7-bit ground track has 128 positions spanning 360 degrees:
            // raw * (360 * 128) / 128 = raw * 360 in 1/128th degrees
            Heading::from_raw_128ths((raw_7bit * 360) as u16)
        } else {
            None
        };

        let time_flag = (me[2] & 0x08) != 0;
        let cpr_odd = (me[2] & 0x04) != 0;

        let lat_cpr =
            ((((me[2] & 0x03) as u32) << 15) | ((me[3] as u32) << 7) | ((me[4] as u32) >> 1))
                & 0x0001_FFFF;

        let lon_cpr = ((((me[4] & 0x01) as u32) << 16) | ((me[5] as u32) << 8) | (me[6] as u32))
            & 0x0001_FFFF;

        Self {
            type_code: tc,
            movement,
            heading,
            time_flag,
            cpr_odd,
            lat_cpr,
            lon_cpr,
        }
    }
}
