use aerofoil_common::DecodeError;

pub mod ident;
pub mod position;
pub mod velocity;

pub use ident::AircraftIdentification;
pub use position::{AirbornePosition, SurfacePosition};
pub use velocity::{AirborneVelocity, VelocityPayload, VerticalRateSource};

/// Decoded payload of an ADS-B Extended Squitter (DF17 or DF18).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EsPayload {
    /// Aircraft identification and category (TC 1..=4).
    Identification(AircraftIdentification),
    /// Surface position (TC 5..=8).
    SurfacePosition(SurfacePosition),
    /// Airborne position (TC 9..=18).
    AirbornePosition(AirbornePosition),
    /// Airborne velocity (TC 19).
    AirborneVelocity(AirborneVelocity),
    /// Other or unhandled Type Code.
    Unknown {
        /// Type Code (1..=31).
        type_code: u8,
        /// Raw 7-byte ME payload.
        raw: [u8; 7],
    },
}

/// An ADS-B Extended Squitter frame (DF17 or DF18, 112 bits / 14 bytes).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExtendedSquitter {
    /// Downlink format (17 for ADS-B broadcast, 18 for non-transponder / TIS-B).
    pub df: u8,
    /// Capability (DF17) or Control Field (DF18), 3 bits.
    pub ca: u8,
    /// 24-bit ICAO aircraft address.
    pub icao_address: u32,
    /// Decoded ME field payload.
    pub payload: EsPayload,
    /// Raw 56-bit (7-byte) ME field.
    pub raw_me: [u8; 7],
    /// 24-bit Parity / Interrogator identifier.
    pub pi: u32,
}

impl ExtendedSquitter {
    /// Parses an Extended Squitter from a 14-byte frame slice.
    pub fn parse(bytes: &[u8; 14]) -> Result<Self, DecodeError> {
        let df = bytes[0] >> 3;
        if df != 17 && df != 18 {
            return Err(DecodeError::UnsupportedFormat { format: df });
        }
        let ca = bytes[0] & 0x07;
        let icao_address = ((bytes[1] as u32) << 16) | ((bytes[2] as u32) << 8) | (bytes[3] as u32);

        let mut raw_me = [0u8; 7];
        raw_me.copy_from_slice(&bytes[4..11]);

        let pi = ((bytes[11] as u32) << 16) | ((bytes[12] as u32) << 8) | (bytes[13] as u32);

        let tc = raw_me[0] >> 3;
        let payload = match tc {
            1..=4 => EsPayload::Identification(AircraftIdentification::parse(&raw_me)),
            5..=8 => EsPayload::SurfacePosition(SurfacePosition::parse(&raw_me)),
            9..=18 => EsPayload::AirbornePosition(AirbornePosition::parse(&raw_me)),
            19 => EsPayload::AirborneVelocity(velocity::decode_airborne_velocity(&raw_me)?),
            _ => EsPayload::Unknown {
                type_code: tc,
                raw: raw_me,
            },
        };

        Ok(Self {
            df,
            ca,
            icao_address,
            payload,
            raw_me,
            pi,
        })
    }
}
