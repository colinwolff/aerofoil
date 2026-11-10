//! Tests for JSON-lines wire contracts and absent field omission (`docs/SPEC.md` §5).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_cli::TargetJsonRecord;
use aerofoil_common::{
    AddressType, AircraftTarget, Altitude, AltitudeKind, Latitude, Longitude, Position,
    ReceptionSource, Squawk, TransponderSource,
};

#[test]
fn test_json_record_serialization_contracts() {
    let mut target = AircraftTarget::new(
        AddressType::Icao,
        0x4840D6,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        1_700_000_000_000,
    );
    target.callsign = Some(*b"KLM123  ");
    target.altitude = Altitude::new(32000, AltitudeKind::Barometric);
    target.position = Some(Position::new(
        Latitude::from_microdegrees(52_308_000).unwrap(),
        Longitude::from_microdegrees(4_764_000).unwrap(),
    ));
    target.squawk = Squawk::new(0o1200);

    let record = TargetJsonRecord::from_target(&target);
    let json_str = serde_json::to_string(&record).unwrap();

    // Verify wire contracts per docs/SPEC.md §5
    assert!(json_str.contains(r#""schema":"aerofoil.target""#));
    assert!(json_str.contains(r#""version":1"#));
    assert!(json_str.contains(r#""address":"4840D6""#));
    assert!(json_str.contains(r#""callsign":"KLM123""#));
    assert!(json_str.contains(r#""altitude":32000"#));
    assert!(json_str.contains(r#""squawk":"1200""#));

    // Absent velocity fields must be completely omitted
    assert!(!json_str.contains("ground_speed_knots"));
    assert!(!json_str.contains("heading_degrees"));
    assert!(!json_str.contains("vertical_rate_fpm"));
}

#[test]
fn test_json_minimal_record_omits_all_absent_fields() {
    let target = AircraftTarget::new(
        AddressType::Anonymous,
        0xAABBCC,
        TransponderSource::Uat978,
        ReceptionSource::Direct,
        1_000_000,
    );
    let record = TargetJsonRecord::from_target(&target);
    let json_str = serde_json::to_string(&record).unwrap();

    assert!(json_str.contains(r#""schema":"aerofoil.target""#));
    assert!(json_str.contains(r#""address":"AABBCC""#));
    assert!(json_str.contains(r#""address_type":"Anonymous""#));
    assert!(!json_str.contains("callsign"));
    assert!(!json_str.contains("altitude"));
    assert!(!json_str.contains("latitude"));
    assert!(!json_str.contains("longitude"));
    assert!(!json_str.contains("squawk"));
}
