//! Global Compact Position Reporting (CPR) airborne position decoding (DO-260B §2.2.3.2.5).
//!
//! In accordance with `docs/SPEC.md` Invariant 9:
//! - An even/odd pair received more than 10 seconds apart is rejected.
//! - Pairs crossing a zone-boundary anomaly ($NL(\text{lat}_0) \ne NL(\text{lat}_1)$) are rejected.
//! - Latitude and longitude are calculated in fixed-point integer micro-degrees with zero float drift.

use core::fmt;

use crate::cpr::nl::cpr_nl;
use crate::{Latitude, Longitude, Position};

/// Maximum age difference permitted between an even and odd frame (10 seconds).
pub const MAX_PAIR_AGE_MS: u64 = 10_000;

/// CPR 17-bit coordinate modulus ($2^{17} = 131{,}072$).
pub const CPR_MODULUS: u32 = 131_072;

/// Why a CPR position pair could not be globally decoded.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CprError {
    /// Both frames have the same parity (expected one even and one odd frame).
    SameParity,
    /// The even and odd frames were received more than 10 seconds apart (`docs/SPEC.md` Invariant 9).
    PairWindowExceeded { delta_ms: u64 },
    /// Zone count mismatch across the transition boundary ($NL(\text{lat}_0) \ne NL(\text{lat}_1)$).
    ZoneMismatch { nl_even: u8, nl_odd: u8 },
    /// Computed latitude was outside $[-90.0^\circ, +90.0^\circ]$.
    InvalidLatitude,
    /// Computed longitude was outside $[-180.0^\circ, +180.0^\circ]$.
    InvalidLongitude,
    /// Raw CPR coordinate requires more than 17 bits ($\ge 131{,}072$).
    OutOfRangeCoordinate { value: u32 },
}

impl fmt::Display for CprError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::SameParity => f.write_str("same CPR parity"),
            Self::PairWindowExceeded { delta_ms } => {
                write!(f, "pair window exceeded: {delta_ms} ms")
            }
            Self::ZoneMismatch { nl_even, nl_odd } => {
                write!(f, "NL zone mismatch: even={nl_even}, odd={nl_odd}")
            }
            Self::InvalidLatitude => f.write_str("decoded latitude out of range"),
            Self::InvalidLongitude => f.write_str("decoded longitude out of range"),
            Self::OutOfRangeCoordinate { value } => write!(f, "raw coordinate {value} >= 131072"),
        }
    }
}

impl core::error::Error for CprError {}

/// A raw 17-bit Compact Position Report from an ADS-B or UAT frame.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RawCpr {
    /// Frame parity: `false` for even ($i = 0$), `true` for odd ($i = 1$).
    pub is_odd: bool,
    /// 17-bit encoded latitude ($0 \le \text{lat} < 131{,}072$).
    pub lat_raw: u32,
    /// 17-bit encoded longitude ($0 \le \text{lon} < 131{,}072$).
    pub lon_raw: u32,
    /// Receive timestamp in milliseconds.
    pub timestamp_ms: u64,
}

impl RawCpr {
    /// Creates a [`RawCpr`], returning `None` if coordinates exceed 17 bits.
    #[must_use]
    pub const fn new(is_odd: bool, lat_raw: u32, lon_raw: u32, timestamp_ms: u64) -> Option<Self> {
        if lat_raw >= CPR_MODULUS || lon_raw >= CPR_MODULUS {
            return None;
        }
        Some(Self {
            is_odd,
            lat_raw,
            lon_raw,
            timestamp_ms,
        })
    }
}

/// Decodes an airborne CPR position from an even and an odd message pair.
pub fn decode_cpr_global(a: &RawCpr, b: &RawCpr) -> Result<Position, CprError> {
    if a.is_odd == b.is_odd {
        return Err(CprError::SameParity);
    }
    let delta_ms = a.timestamp_ms.abs_diff(b.timestamp_ms);
    if delta_ms > MAX_PAIR_AGE_MS {
        return Err(CprError::PairWindowExceeded { delta_ms });
    }

    let (even, odd) = if a.is_odd { (b, a) } else { (a, b) };
    let even_is_newer = even.timestamp_ms > odd.timestamp_ms;

    decode_airborne_cpr_raw(
        even.lat_raw,
        even.lon_raw,
        odd.lat_raw,
        odd.lon_raw,
        even_is_newer,
    )
}

/// Decodes an airborne CPR position from raw 17-bit coordinates.
pub fn decode_airborne_cpr_raw(
    even_lat: u32,
    even_lon: u32,
    odd_lat: u32,
    odd_lon: u32,
    even_is_newer: bool,
) -> Result<Position, CprError> {
    const MOD: i64 = CPR_MODULUS as i64;
    if even_lat >= CPR_MODULUS {
        return Err(CprError::OutOfRangeCoordinate { value: even_lat });
    }
    if even_lon >= CPR_MODULUS {
        return Err(CprError::OutOfRangeCoordinate { value: even_lon });
    }
    if odd_lat >= CPR_MODULUS {
        return Err(CprError::OutOfRangeCoordinate { value: odd_lat });
    }
    if odd_lon >= CPR_MODULUS {
        return Err(CprError::OutOfRangeCoordinate { value: odd_lon });
    }

    // Latitude index j = floor((59 * YZ0 - 60 * YZ1) / 131072 + 1/2)
    let num_j = 59 * (even_lat as i64) - 60 * (odd_lat as i64);
    let j = (2 * num_j + MOD).div_euclid(2 * MOD);

    // rLat0 = 6_000_000 * (j % 60 + YZ0 / MOD)
    let mut lat_even_micro =
        6_000_000 * j.rem_euclid(60) + (6_000_000 * (even_lat as i64) + MOD / 2) / MOD;
    if lat_even_micro >= 270_000_000 {
        lat_even_micro -= 360_000_000;
    }

    // rLat1 = (360_000_000 / 59) * (j % 59 + YZ1 / MOD)
    let num_odd = 360_000_000 * (j.rem_euclid(59) * MOD + (odd_lat as i64));
    let mut lat_odd_micro = (num_odd + (59 * MOD) / 2) / (59 * MOD);
    if lat_odd_micro >= 270_000_000 {
        lat_odd_micro -= 360_000_000;
    }

    let lat_even_i32 = i32::try_from(lat_even_micro).map_err(|_| CprError::InvalidLatitude)?;
    let lat_odd_i32 = i32::try_from(lat_odd_micro).map_err(|_| CprError::InvalidLatitude)?;

    let (Some(lat_even), Some(lat_odd)) = (
        Latitude::from_microdegrees(lat_even_i32),
        Latitude::from_microdegrees(lat_odd_i32),
    ) else {
        return Err(CprError::InvalidLatitude);
    };

    let nl_even = cpr_nl(lat_even);
    let nl_odd = cpr_nl(lat_odd);
    if nl_even != nl_odd {
        return Err(CprError::ZoneMismatch { nl_even, nl_odd });
    }

    let nl_i64 = i64::from(nl_even);
    let final_lat = if even_is_newer { lat_even } else { lat_odd };

    // Longitude index m = floor((XZ0 * (NL - 1) - XZ1 * NL) / MOD + 1/2)
    let num_m = (even_lon as i64) * (nl_i64 - 1) - (odd_lon as i64) * nl_i64;
    let m = (2 * num_m + MOD).div_euclid(2 * MOD);

    let (ni, lon_raw) = if even_is_newer {
        (nl_i64, even_lon as i64)
    } else {
        ((nl_i64 - 1).max(1), odd_lon as i64)
    };

    let num_lon = 360_000_000 * (m.rem_euclid(ni) * MOD + lon_raw);
    let mut lon_micro = (num_lon + (ni * MOD) / 2) / (ni * MOD);
    if lon_micro >= 180_000_000 {
        lon_micro -= 360_000_000;
    }

    let lon_i32 = i32::try_from(lon_micro).map_err(|_| CprError::InvalidLongitude)?;
    let Some(final_lon) = Longitude::from_microdegrees(lon_i32) else {
        return Err(CprError::InvalidLongitude);
    };

    Ok(Position::new(final_lat, final_lon))
}
