//! Wire JSON serialization for target telemetry conforming to `docs/SPEC.md` §5.

use aerofoil_common::{AircraftTarget, ReceptionSource, TransponderSource};
use serde::{Deserialize, Serialize};

/// Wire format for an aircraft target state broadcast.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TargetWireJson {
    /// Canonical schema identifier.
    pub schema: &'static str,
    /// Schema format version.
    pub version: u32,
    /// Transponder address type.
    pub address_type: String,
    /// 24-bit transponder address hex.
    pub address: String,
    /// Flight identification callsign.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub callsign: Option<String>,
    /// Altitude in whole feet.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub altitude: Option<i32>,
    /// Ground speed in knots.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ground_speed: Option<u16>,
    /// Track heading in decimal degrees.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading: Option<f64>,
    /// Mode A squawk code octal string.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub squawk: Option<String>,
    /// Latitude in decimal degrees.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lat: Option<f64>,
    /// Longitude in decimal degrees.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lon: Option<f64>,
    /// Surveillance link band.
    pub source: TransponderSourceWire,
    /// Provenance / reception source (e.g. "Direct", "Rebroadcast", "Mlat").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reception: Option<String>,
    /// Monotonic timestamp in milliseconds when last seen.
    pub last_seen_ms: u64,
}

/// Wire representation of surveillance link source.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TransponderSourceWire {
    /// 1090ES Mode S broadcast.
    ModeS1090,
    /// 978 UAT broadcast.
    Uat978,
}

impl From<TransponderSource> for TransponderSourceWire {
    fn from(s: TransponderSource) -> Self {
        match s {
            TransponderSource::ModeS1090 => Self::ModeS1090,
            TransponderSource::Uat978 => Self::Uat978,
        }
    }
}

impl TargetWireJson {
    /// Converts a domain [`AircraftTarget`] into a wire JSON representation.
    #[must_use]
    pub fn from_target(target: &AircraftTarget) -> Self {
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

        Self {
            schema: "aerofoil.target",
            version: 1,
            address_type: format!("{:?}", target.address_type),
            address: format!("{:06X}", target.address),
            callsign,
            altitude: target.altitude.map(|a| a.feet()),
            ground_speed: target.velocity.ground_speed_knots,
            heading,
            squawk: target.squawk.map(|s| format!("{s}")),
            lat,
            lon,
            source: target.source.into(),
            reception: Some(match target.reception {
                ReceptionSource::Direct => "Direct".to_string(),
                ReceptionSource::Rebroadcast => "Rebroadcast".to_string(),
                ReceptionSource::Mlat => "Mlat".to_string(),
            }),
            last_seen_ms: target.last_seen_ms,
        }
    }
}
