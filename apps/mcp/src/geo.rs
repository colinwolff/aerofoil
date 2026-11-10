//! Geographic distance calculation and target formatting for MCP tools.

use aerofoil_common::{AircraftTarget, TransponderSource};
use serde_json::{Value, json};

/// Computes great-circle distance between two coordinates in nautical miles.
#[must_use]
pub fn haversine_nm(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let d_lat = (lat2 - lat1).to_radians();
    let d_lon = (lon2 - lon1).to_radians();
    let lat1_rad = lat1.to_radians();
    let lat2_rad = lat2.to_radians();

    let a =
        (d_lat / 2.0).sin().powi(2) + lat1_rad.cos() * lat2_rad.cos() * (d_lon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().asin();
    3440.065 * c
}

/// Converts an [`AircraftTarget`] into a friendly JSON representation.
#[must_use]
pub fn format_target(target: &AircraftTarget) -> Value {
    let callsign = target
        .callsign
        .and_then(|cs| core::str::from_utf8(&cs).ok().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty());

    let (lat, lon) = target.position.map_or((None, None), |p| {
        let (la, lo) = p.to_f64();
        (Some(la), Some(lo))
    });

    let heading = target
        .velocity
        .heading
        .map(|h| h.whole_degrees() as f64 + (h.tenths() as f64 * 0.1));

    let band = match target.source {
        TransponderSource::ModeS1090 => "1090ES",
        TransponderSource::Uat978 => "UAT978",
    };

    let squawk_str = target.squawk.map(|s| format!("{:04o}", s.code()));

    json!({
        "address": format!("{:06X}", target.address),
        "address_dec": target.address,
        "callsign": callsign,
        "squawk": squawk_str,
        "altitude_ft": target.altitude.map(|a| a.feet()),
        "ground_speed_knots": target.velocity.ground_speed_knots,
        "heading_deg": heading,
        "vertical_rate_fpm": target.velocity.vertical_rate_fpm,
        "latitude": lat,
        "longitude": lon,
        "source": band,
        "last_seen_ms": target.last_seen_ms,
    })
}
