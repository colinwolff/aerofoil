#![cfg(feature = "export-ts")]
#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_common::{
    AddressType, AircraftTarget, AirspaceEvent, Altitude, AltitudeKind, Heading, Latitude,
    Longitude, Position, ReceptionSource, Squawk, TransponderSource, Velocity,
};
use ts_rs::TS;

#[test]
fn export_ts_definitions_generated() {
    let cfg = ts_rs::Config::default();
    assert!(!AddressType::decl(&cfg).is_empty());
    assert!(!TransponderSource::decl(&cfg).is_empty());
    assert!(!ReceptionSource::decl(&cfg).is_empty());
    assert!(!Velocity::decl(&cfg).is_empty());
    assert!(!AircraftTarget::decl(&cfg).is_empty());
    assert!(!AirspaceEvent::decl(&cfg).is_empty());
    assert!(!Latitude::decl(&cfg).is_empty());
    assert!(!Longitude::decl(&cfg).is_empty());
    assert!(!Position::decl(&cfg).is_empty());
    assert!(!Altitude::decl(&cfg).is_empty());
    assert!(!AltitudeKind::decl(&cfg).is_empty());
    assert!(!Squawk::decl(&cfg).is_empty());
    assert!(!Heading::decl(&cfg).is_empty());
}
