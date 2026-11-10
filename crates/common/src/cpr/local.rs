//! Local Compact Position Reporting (CPR) airborne position decoding (DO-260B §2.2.3.2.6).
//!
//! In accordance with `docs/SPEC.md` Invariant 9:
//! - Decodes a single airborne CPR message (even or odd) using a reference position within 180 NM.
//! - Uses integer micro-degrees with zero float drift.
//! - Out-of-range inputs return strongly typed [`CprError`] variants without silent clamping.

use crate::cpr::global::{CPR_MODULUS, CprError, RawCpr};
use crate::cpr::nl::cpr_n;
use crate::{Latitude, Longitude, Position};

/// Decodes an airborne CPR position from a single report and a reference position.
pub fn decode_cpr_local(report: &RawCpr, reference: Position) -> Result<Position, CprError> {
    decode_airborne_cpr_local_raw(report.is_odd, report.lat_raw, report.lon_raw, reference)
}

/// Decodes an airborne CPR position from raw 17-bit coordinates and a reference position.
pub fn decode_airborne_cpr_local_raw(
    is_odd: bool,
    lat_raw: u32,
    lon_raw: u32,
    reference: Position,
) -> Result<Position, CprError> {
    const MOD: i64 = CPR_MODULUS as i64;
    if lat_raw >= CPR_MODULUS {
        return Err(CprError::OutOfRangeCoordinate { value: lat_raw });
    }
    if lon_raw >= CPR_MODULUS {
        return Err(CprError::OutOfRangeCoordinate { value: lon_raw });
    }

    let k: i64 = if is_odd { 59 } else { 60 };
    let ref_lat_micro = i64::from(reference.lat().microdegrees());

    // Latitude zone index j = floor(ref_lat / dlat - yz / MOD + 1/2)
    // where dlat = 360_000_000 / k
    let num_j =
        2 * k * ref_lat_micro * MOD - 2 * i64::from(lat_raw) * 360_000_000 + 360_000_000 * MOD;
    let den_j = 2 * 360_000_000 * MOD;
    let j = num_j.div_euclid(den_j);

    // lat_micro = 360_000_000 * (j % k + yz / MOD) / k
    let num_lat = 360_000_000 * (j.rem_euclid(k) * MOD + i64::from(lat_raw));
    let den_lat = k * MOD;
    let mut lat_micro = (num_lat + den_lat / 2) / den_lat;
    if lat_micro >= 270_000_000 {
        lat_micro -= 360_000_000;
    }

    let lat_i32 = i32::try_from(lat_micro).map_err(|_| CprError::InvalidLatitude)?;
    let Some(final_lat) = Latitude::from_microdegrees(lat_i32) else {
        return Err(CprError::InvalidLatitude);
    };

    let n = i64::from(cpr_n(final_lat, is_odd));
    let ref_lon_micro = i64::from(reference.lon().microdegrees());

    // Longitude zone index m = floor(ref_lon / dlon - xz / MOD + 1/2)
    // where dlon = 360_000_000 / n
    let num_m =
        2 * n * ref_lon_micro * MOD - 2 * i64::from(lon_raw) * 360_000_000 + 360_000_000 * MOD;
    let den_m = 2 * 360_000_000 * MOD;
    let m = num_m.div_euclid(den_m);

    // lon_micro = 360_000_000 * (m % n + xz / MOD) / n
    let num_lon = 360_000_000 * (m.rem_euclid(n) * MOD + i64::from(lon_raw));
    let den_lon = n * MOD;
    let mut lon_micro = (num_lon + den_lon / 2) / den_lon;
    if lon_micro >= 180_000_000 {
        lon_micro -= 360_000_000;
    }

    let lon_i32 = i32::try_from(lon_micro).map_err(|_| CprError::InvalidLongitude)?;
    let Some(final_lon) = Longitude::from_microdegrees(lon_i32) else {
        return Err(CprError::InvalidLongitude);
    };

    Ok(Position::new(final_lat, final_lon))
}
