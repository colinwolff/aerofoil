use core::fmt;

use super::{Latitude, Longitude};

/// A 2D geographic position composed of fixed-point [`Latitude`] and [`Longitude`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "export-ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "export-ts", ts(export))]
pub struct Position {
    lat: Latitude,
    lon: Longitude,
}

impl Position {
    /// Creates a new [`Position`] from validated [`Latitude`] and [`Longitude`].
    #[must_use]
    pub const fn new(lat: Latitude, lon: Longitude) -> Self {
        Self { lat, lon }
    }

    /// Creates a [`Position`] from raw micro-degrees, validating boundaries.
    #[must_use]
    pub const fn from_microdegrees(lat_microdegrees: i32, lon_microdegrees: i32) -> Option<Self> {
        let (Some(lat), Some(lon)) = (
            Latitude::from_microdegrees(lat_microdegrees),
            Longitude::from_microdegrees(lon_microdegrees),
        ) else {
            return None;
        };
        Some(Self { lat, lon })
    }

    /// The position's latitude.
    #[must_use]
    pub const fn lat(self) -> Latitude {
        self.lat
    }

    /// The position's longitude.
    #[must_use]
    pub const fn lon(self) -> Longitude {
        self.lon
    }

    /// Converts the position to `(f64, f64)` degrees for external consumers.
    #[must_use]
    pub fn to_f64(self) -> (f64, f64) {
        (self.lat.to_f64(), self.lon.to_f64())
    }
}

impl fmt::Display for Position {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "({}, {})", self.lat, self.lon)
    }
}
