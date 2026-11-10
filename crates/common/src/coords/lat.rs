use core::fmt;

/// A latitude in fixed-point micro-degrees ($\mu^\circ$), spanning $-90.0^\circ$ to $+90.0^\circ$.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "export-ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "export-ts", ts(export))]
pub struct Latitude(i32);

impl Latitude {
    /// Latitude at the equator ($0.0^\circ$).
    pub const ZERO: Self = Self(0);

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

impl Default for Latitude {
    fn default() -> Self {
        Self::ZERO
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
