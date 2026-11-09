//! Fixed-point geographic coordinates in micro-degrees (WGS-84).
//!
//! Latitude and longitude are stored as integer micro-degrees ($1^\circ = 1{,}000{,}000\,\mu^\circ$).
//! In accordance with `docs/SPEC.md` Invariant 9, no floating-point value is ever the stored form
//! of a position. This guarantees bit-identical results across architectures, avoids rounding drift,
//! and enables formatting without dynamic heap allocation.
//!
//! Out-of-range coordinates are refused on construction (`docs/SPEC.md` §6, "no silent repair").

use core::fmt;

/// A latitude in fixed-point micro-degrees ($\mu^\circ$), spanning $-90.0^\circ$ to $+90.0^\circ$.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Latitude(i32);

impl Latitude {
    /// Minimum valid latitude in micro-degrees ($-90.0^\circ$).
    pub const MIN_MICRODEGREES: i32 = -90_000_000;
    /// Maximum valid latitude in micro-degrees ($+90.0^\circ$).
    pub const MAX_MICRODEGREES: i32 = 90_000_000;

    /// Creates a [`Latitude`] from raw micro-degrees, returning `None` if out of range.
    #[must_use]
    pub const fn from_microdegrees(raw: i32) -> Option<Self> {
        if raw < Self::MIN_MICRODEGREES || raw > Self::MAX_MICRODEGREES {
            return None;
        }
        Some(Self(raw))
    }

    /// Creates a [`Latitude`] from whole degrees, returning `None` if outside `-90`..=`90`.
    #[must_use]
    pub const fn from_degrees_whole(degrees: i32) -> Option<Self> {
        if degrees < -90 || degrees > 90 {
            return None;
        }
        Some(Self(degrees * 1_000_000))
    }

    /// Returns the raw latitude in micro-degrees.
    #[must_use]
    pub const fn microdegrees(self) -> i32 {
        self.0
    }

    /// Returns whole degrees truncated toward zero.
    #[must_use]
    pub const fn whole_degrees(self) -> i32 {
        self.0 / 1_000_000
    }

    /// Returns the fractional millionths of a degree ($0$..$999{,}999$).
    #[must_use]
    pub const fn millionths(self) -> u32 {
        self.0.unsigned_abs() % 1_000_000
    }

    /// Converts the latitude to an `f64` degree value for external consumers.
    #[must_use]
    pub fn to_f64(self) -> f64 {
        f64::from(self.0) / 1_000_000.0
    }
}

impl fmt::Display for Latitude {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let abs = self.0.unsigned_abs();
        let sign = if self.0 < 0 { "-" } else { "" };
        write!(
            f,
            "{sign}{}.{:06}\u{00b0}",
            abs / 1_000_000,
            abs % 1_000_000
        )
    }
}

/// A longitude in fixed-point micro-degrees ($\mu^\circ$), spanning $-180.0^\circ$ to $+180.0^\circ$.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Longitude(i32);

impl Longitude {
    /// Minimum valid longitude in micro-degrees ($-180.0^\circ$).
    pub const MIN_MICRODEGREES: i32 = -180_000_000;
    /// Maximum valid longitude in micro-degrees ($+180.0^\circ$).
    pub const MAX_MICRODEGREES: i32 = 180_000_000;

    /// Creates a [`Longitude`] from raw micro-degrees, returning `None` if out of range.
    #[must_use]
    pub const fn from_microdegrees(raw: i32) -> Option<Self> {
        if raw < Self::MIN_MICRODEGREES || raw > Self::MAX_MICRODEGREES {
            return None;
        }
        Some(Self(raw))
    }

    /// Creates a [`Longitude`] from whole degrees, returning `None` if outside `-180`..=`180`.
    #[must_use]
    pub const fn from_degrees_whole(degrees: i32) -> Option<Self> {
        if degrees < -180 || degrees > 180 {
            return None;
        }
        Some(Self(degrees * 1_000_000))
    }

    /// Returns the raw longitude in micro-degrees.
    #[must_use]
    pub const fn microdegrees(self) -> i32 {
        self.0
    }

    /// Returns whole degrees truncated toward zero.
    #[must_use]
    pub const fn whole_degrees(self) -> i32 {
        self.0 / 1_000_000
    }

    /// Returns the fractional millionths of a degree ($0$..$999{,}999$).
    #[must_use]
    pub const fn millionths(self) -> u32 {
        self.0.unsigned_abs() % 1_000_000
    }

    /// Converts the longitude to an `f64` degree value for external consumers.
    #[must_use]
    pub fn to_f64(self) -> f64 {
        f64::from(self.0) / 1_000_000.0
    }
}

impl fmt::Display for Longitude {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let abs = self.0.unsigned_abs();
        let sign = if self.0 < 0 { "-" } else { "" };
        write!(
            f,
            "{sign}{}.{:06}\u{00b0}",
            abs / 1_000_000,
            abs % 1_000_000
        )
    }
}

/// A 2D geographic position composed of fixed-point [`Latitude`] and [`Longitude`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
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
