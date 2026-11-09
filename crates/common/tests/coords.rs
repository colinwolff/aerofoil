//! Geographic coordinates: fixed-point latitude, longitude and position (`docs/SPEC.md` Invariant 9, §6).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_common::{Latitude, Longitude, Position};

#[test]
fn latitude_accepts_valid_range_and_refuses_out_of_bounds() {
    assert!(Latitude::from_microdegrees(-90_000_000).is_some());
    assert!(Latitude::from_microdegrees(90_000_000).is_some());
    assert!(Latitude::from_microdegrees(0).is_some());
    assert!(Latitude::from_microdegrees(37_774_929).is_some());

    assert!(Latitude::from_microdegrees(-90_000_001).is_none());
    assert!(Latitude::from_microdegrees(90_000_001).is_none());
    assert!(Latitude::from_microdegrees(i32::MIN).is_none());
    assert!(Latitude::from_microdegrees(i32::MAX).is_none());
}

#[test]
fn latitude_from_whole_degrees() {
    assert_eq!(
        Latitude::from_degrees_whole(-90).unwrap().microdegrees(),
        -90_000_000
    );
    assert_eq!(
        Latitude::from_degrees_whole(90).unwrap().microdegrees(),
        90_000_000
    );
    assert_eq!(Latitude::from_degrees_whole(0).unwrap().microdegrees(), 0);
    assert!(Latitude::from_degrees_whole(-91).is_none());
    assert!(Latitude::from_degrees_whole(91).is_none());
}

#[test]
fn latitude_parts_and_conversions() {
    let lat = Latitude::from_microdegrees(37_774_929).unwrap();
    assert_eq!(lat.whole_degrees(), 37);
    assert_eq!(lat.millionths(), 774_929);
    assert!((lat.to_f64() - 37.774_929).abs() < 1e-9);

    let south = Latitude::from_microdegrees(-33_868_820).unwrap();
    assert_eq!(south.whole_degrees(), -33);
    assert_eq!(south.millionths(), 868_820);
    assert!((south.to_f64() - -33.868_820).abs() < 1e-9);
}

#[test]
fn latitude_display_formatting() {
    assert_eq!(
        format!("{}", Latitude::from_microdegrees(0).unwrap()),
        "0.000000\u{00b0}"
    );
    assert_eq!(
        format!("{}", Latitude::from_microdegrees(500_000).unwrap()),
        "0.500000\u{00b0}"
    );
    assert_eq!(
        format!("{}", Latitude::from_microdegrees(-500_000).unwrap()),
        "-0.500000\u{00b0}"
    );
    assert_eq!(
        format!("{}", Latitude::from_microdegrees(-1).unwrap()),
        "-0.000001\u{00b0}"
    );
    assert_eq!(
        format!("{}", Latitude::from_microdegrees(37_774_929).unwrap()),
        "37.774929\u{00b0}"
    );
    assert_eq!(
        format!("{}", Latitude::from_microdegrees(-90_000_000).unwrap()),
        "-90.000000\u{00b0}"
    );
}

#[test]
fn longitude_accepts_valid_range_and_refuses_out_of_bounds() {
    assert!(Longitude::from_microdegrees(-180_000_000).is_some());
    assert!(Longitude::from_microdegrees(180_000_000).is_some());
    assert!(Longitude::from_microdegrees(0).is_some());
    assert!(Longitude::from_microdegrees(-122_419_416).is_some());

    assert!(Longitude::from_microdegrees(-180_000_001).is_none());
    assert!(Longitude::from_microdegrees(180_000_001).is_none());
    assert!(Longitude::from_microdegrees(i32::MIN).is_none());
    assert!(Longitude::from_microdegrees(i32::MAX).is_none());
}

#[test]
fn longitude_from_whole_degrees() {
    assert_eq!(
        Longitude::from_degrees_whole(-180).unwrap().microdegrees(),
        -180_000_000
    );
    assert_eq!(
        Longitude::from_degrees_whole(180).unwrap().microdegrees(),
        180_000_000
    );
    assert_eq!(Longitude::from_degrees_whole(0).unwrap().microdegrees(), 0);
    assert!(Longitude::from_degrees_whole(-181).is_none());
    assert!(Longitude::from_degrees_whole(181).is_none());
}

#[test]
fn longitude_parts_and_conversions() {
    let lon = Longitude::from_microdegrees(-122_419_416).unwrap();
    assert_eq!(lon.whole_degrees(), -122);
    assert_eq!(lon.millionths(), 419_416);
    assert!((lon.to_f64() - -122.419_416).abs() < 1e-9);

    let east = Longitude::from_microdegrees(151_209_296).unwrap();
    assert_eq!(east.whole_degrees(), 151);
    assert_eq!(east.millionths(), 209_296);
    assert!((east.to_f64() - 151.209_296).abs() < 1e-9);
}

#[test]
fn longitude_display_formatting() {
    assert_eq!(
        format!("{}", Longitude::from_microdegrees(0).unwrap()),
        "0.000000\u{00b0}"
    );
    assert_eq!(
        format!("{}", Longitude::from_microdegrees(500_000).unwrap()),
        "0.500000\u{00b0}"
    );
    assert_eq!(
        format!("{}", Longitude::from_microdegrees(-500_000).unwrap()),
        "-0.500000\u{00b0}"
    );
    assert_eq!(
        format!("{}", Longitude::from_microdegrees(-180_000_000).unwrap()),
        "-180.000000\u{00b0}"
    );
    assert_eq!(
        format!("{}", Longitude::from_microdegrees(180_000_000).unwrap()),
        "180.000000\u{00b0}"
    );
}

#[test]
fn position_construction_and_display() {
    let lat = Latitude::from_microdegrees(37_774_929).unwrap();
    let lon = Longitude::from_microdegrees(-122_419_416).unwrap();
    let pos = Position::new(lat, lon);

    assert_eq!(pos.lat(), lat);
    assert_eq!(pos.lon(), lon);
    assert_eq!(
        pos,
        Position::from_microdegrees(37_774_929, -122_419_416).unwrap()
    );

    let (lat_f64, lon_f64) = pos.to_f64();
    assert!((lat_f64 - 37.774_929).abs() < 1e-9);
    assert!((lon_f64 - -122.419_416).abs() < 1e-9);

    assert_eq!(format!("{pos}"), "(37.774929\u{00b0}, -122.419416\u{00b0})");
    assert!(Position::from_microdegrees(90_000_001, 0).is_none());
    assert!(Position::from_microdegrees(0, 180_000_001).is_none());
}

#[test]
fn coordinate_types_are_compact() {
    assert_eq!(core::mem::size_of::<Latitude>(), 4);
    assert_eq!(core::mem::size_of::<Longitude>(), 4);
    assert_eq!(core::mem::size_of::<Position>(), 8);
}
