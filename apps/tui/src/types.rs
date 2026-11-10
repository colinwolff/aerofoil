//! Common types, column definitions, and geometric helpers for `aerofoil-tui`.

use aerofoil_common::Squawk;

/// Available columns for sorting target telemetry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortColumn {
    /// 24-bit ICAO address hex.
    Address,
    /// Flight callsign.
    Callsign,
    /// Target altitude in feet.
    Altitude,
    /// Ground speed in knots.
    Speed,
    /// Mode A identity code.
    Squawk,
    /// Distance from radar center in nautical miles.
    Distance,
}

impl SortColumn {
    /// Next column in cyclic selection.
    #[must_use]
    pub const fn next(self) -> Self {
        match self {
            Self::Address => Self::Callsign,
            Self::Callsign => Self::Altitude,
            Self::Altitude => Self::Speed,
            Self::Speed => Self::Squawk,
            Self::Squawk => Self::Distance,
            Self::Distance => Self::Address,
        }
    }
}

/// Returns `true` if `squawk` matches an emergency code (7500, 7600, 7700).
#[must_use]
pub const fn is_emergency_squawk(squawk: Option<Squawk>) -> bool {
    match squawk {
        Some(s) => {
            let c = s.code();
            c == 0o7500 || c == 0o7600 || c == 0o7700
        }
        None => false,
    }
}

/// Compute approximate distance in nautical miles from radar center.
#[must_use]
pub fn distance_nm(center_lat: f64, center_lon: f64, target_lat: f64, target_lon: f64) -> f64 {
    let dlat = (target_lat - center_lat) * 60.0;
    let avg_lat_rad = ((center_lat + target_lat) * 0.5).to_radians();
    let dlon = (target_lon - center_lon) * 60.0 * avg_lat_rad.cos();
    (dlat * dlat + dlon * dlon).sqrt()
}
