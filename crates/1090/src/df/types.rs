//! Common enumeration and status types for Mode S Downlink Formats.

/// Flight status reported in DF4, DF5, DF20, DF21 (`docs/SPEC.md` §2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum FlightStatus {
    /// Normal, airborne.
    NoAlertAirborne,
    /// Normal, on ground.
    NoAlertGround,
    /// Alert (emergency / squawk change), airborne.
    AlertAirborne,
    /// Alert (emergency / squawk change), on ground.
    AlertGround,
    /// Alert, SPI (Special Position Identification) condition, either ground or airborne.
    AlertSpecial,
    /// Normal, SPI condition, either ground or airborne.
    Special,
    /// Reserved value (6..=7).
    Reserved(u8),
}

impl FlightStatus {
    /// Creates a [`FlightStatus`] from the 3-bit raw field in bits 6..=8.
    #[must_use]
    pub const fn from_raw(raw: u8) -> Self {
        match raw & 0x07 {
            0 => Self::NoAlertAirborne,
            1 => Self::NoAlertGround,
            2 => Self::AlertAirborne,
            3 => Self::AlertGround,
            4 => Self::AlertSpecial,
            5 => Self::Special,
            val => Self::Reserved(val),
        }
    }

    /// Indicates whether the aircraft is reported on the ground.
    #[must_use]
    pub const fn is_on_ground(self) -> bool {
        matches!(self, Self::NoAlertGround | Self::AlertGround)
    }

    /// Indicates whether an alert (emergency / squawk change) is active.
    #[must_use]
    pub const fn is_alert(self) -> bool {
        matches!(
            self,
            Self::AlertAirborne | Self::AlertGround | Self::AlertSpecial
        )
    }
}

/// Transponder capability reported in DF11 and DF17 (`CA` field).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum TransponderCapability {
    /// Level 1 transponder (surveillance only).
    Level1,
    /// Level 2+ transponder, airborne.
    Airborne,
    /// Level 2+ transponder, on ground.
    OnGround,
    /// Level 2+ transponder, airborne or ground (not specified).
    AirborneOrGround,
    /// Other / reserved capability code.
    Other(u8),
}

impl TransponderCapability {
    /// Creates a [`TransponderCapability`] from the 3-bit `CA` field.
    #[must_use]
    pub const fn from_raw(raw: u8) -> Self {
        match raw & 0x07 {
            0 => Self::Level1,
            4 => Self::OnGround,
            5 => Self::Airborne,
            6 => Self::AirborneOrGround,
            val => Self::Other(val),
        }
    }
}

/// Surveillance status in Extended Squitter airborne position messages.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum SurveillanceStatus {
    /// No condition / normal.
    NoCondition,
    /// Permanent alert (emergency code 7500, 7600, or 7700).
    PermanentAlert,
    /// Temporary alert (squawk change).
    TemporaryAlert,
    /// SPI (Special Position Identification) active.
    Spi,
}

impl SurveillanceStatus {
    /// Creates a [`SurveillanceStatus`] from the 2-bit field.
    #[must_use]
    pub const fn from_raw(raw: u8) -> Self {
        match raw & 0x03 {
            0 => Self::NoCondition,
            1 => Self::PermanentAlert,
            2 => Self::TemporaryAlert,
            3 => Self::Spi,
            _ => unreachable!(),
        }
    }
}
