//! Schema-versioned JSON-lines serialization models (`docs/SPEC.md` §5).
//!
//! Contracts:
//! - Every object carries `{"schema": "aerofoil.<record>", "version": <u32>}`.
//! - Absent fields are completely omitted from serialization.

use aerofoil_common::AircraftTarget;
use serde::Serialize;

/// Serialized surveillance target record.
#[derive(Debug, Clone, Serialize)]
pub struct TargetJsonRecord {
    /// Schema namespace and identifier.
    pub schema: &'static str,
    /// Schema format version.
    pub version: u32,
    /// Address qualification / space (e.g. "Icao", "Anonymous").
    pub address_type: String,
    /// 24-bit aircraft hex address.
    pub address: String,
    /// Flight identification / callsign.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub callsign: Option<String>,
    /// Altitude in feet above mean sea level or ground.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub altitude: Option<i32>,
    /// Latitude in decimal degrees.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latitude: Option<f64>,
    /// Longitude in decimal degrees.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub longitude: Option<f64>,
    /// Ground speed in whole knots.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ground_speed_knots: Option<u16>,
    /// Ground track heading in tenths of a degree.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading_degrees: Option<f64>,
    /// Vertical speed in feet per minute.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vertical_rate_fpm: Option<i16>,
    /// Mode A transponder identity code.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub squawk: Option<String>,
    /// Surveillance link protocol.
    pub source: String,
    /// Reception path (Direct vs Rebroadcast).
    pub reception: String,
    /// Monotonic timestamp in milliseconds when target was last observed.
    pub last_seen_ms: u64,
}

impl TargetJsonRecord {
    /// Creates a [`TargetJsonRecord`] from a live [`AircraftTarget`].
    #[must_use]
    pub fn from_target(target: &AircraftTarget) -> Self {
        let callsign = target.callsign.map(|cs| {
            let s = String::from_utf8_lossy(&cs);
            s.trim().to_string()
        });

        let (latitude, longitude) = match target.position {
            Some(pos) => (Some(pos.lat().to_f64()), Some(pos.lon().to_f64())),
            None => (None, None),
        };

        let heading_degrees = target
            .velocity
            .heading
            .map(|h| (h.raw_128ths() as f64) / 128.0);

        Self {
            schema: "aerofoil.target",
            version: 1,
            address_type: format!("{:?}", target.address_type),
            address: format!("{:06X}", target.address),
            callsign,
            altitude: target.altitude.map(|a| a.feet()),
            latitude,
            longitude,
            ground_speed_knots: target.velocity.ground_speed_knots,
            heading_degrees,
            vertical_rate_fpm: target.velocity.vertical_rate_fpm,
            squawk: target.squawk.map(|sq| sq.to_string()),
            source: format!("{:?}", target.source),
            reception: format!("{:?}", target.reception),
            last_seen_ms: target.last_seen_ms,
        }
    }
}
