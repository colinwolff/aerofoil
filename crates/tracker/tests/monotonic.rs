//! Tests for monotonic per-field merging and airspace event emission (`docs/SPEC.md` Invariant 10).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_common::{
    AddressType, AirspaceEvent, Altitude, AltitudeKind, Heading, Latitude, Longitude, Position,
    ReceptionSource, Squawk, TransponderSource,
};
use aerofoil_tracker::{TargetUpdate, Tracker};

#[test]
fn test_target_acquired_and_updated_events() {
    let tracker = Tracker::new();
    let addr = 0xA01234;

    // First update: acquire target
    let u1 = TargetUpdate::new(
        AddressType::Icao,
        addr,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        1_000_000,
    )
    .with_callsign(*b"AAL123  ");

    let event = tracker.update(&u1).unwrap();
    match event {
        AirspaceEvent::TargetAcquired(target) => {
            assert_eq!(target.address, addr);
            assert_eq!(target.callsign, Some(*b"AAL123  "));
            assert_eq!(target.last_seen_ms, 1_000_000);
        }
        _ => panic!("expected TargetAcquired event"),
    }

    assert_eq!(tracker.len(), 1);

    // Second update: update existing target
    let u2 = TargetUpdate::new(
        AddressType::Icao,
        addr,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        1_001_000,
    )
    .with_altitude(Altitude::new(35000, AltitudeKind::Barometric).unwrap());

    let event2 = tracker.update(&u2).unwrap();
    match event2 {
        AirspaceEvent::TargetUpdated(target) => {
            assert_eq!(target.address, addr);
            // Monotonic preservation of callsign from u1
            assert_eq!(target.callsign, Some(*b"AAL123  "));
            // Newly populated altitude from u2
            assert_eq!(
                target.altitude,
                Some(Altitude::new(35000, AltitudeKind::Barometric).unwrap())
            );
            assert_eq!(target.last_seen_ms, 1_001_000);
        }
        _ => panic!("expected TargetUpdated event"),
    }
}

#[test]
fn test_monotonic_per_field_merging() {
    let tracker = Tracker::new();
    let addr = 0xB12345;

    // Step 1: Identification message sets callsign
    tracker.update(
        &TargetUpdate::new(
            AddressType::Icao,
            addr,
            TransponderSource::ModeS1090,
            ReceptionSource::Direct,
            100,
        )
        .with_callsign(*b"DAL456  "),
    );

    // Step 2: Airborne position message adds lat/lon and altitude
    let pos = Position::new(
        Latitude::from_microdegrees(37_618_800).unwrap(),
        Longitude::from_microdegrees(-122_375_400).unwrap(),
    );
    tracker.update(
        &TargetUpdate::new(
            AddressType::Icao,
            addr,
            TransponderSource::ModeS1090,
            ReceptionSource::Direct,
            200,
        )
        .with_position(pos)
        .with_altitude(Altitude::new(24000, AltitudeKind::Barometric).unwrap()),
    );

    // Step 3: Airborne velocity message adds ground speed and heading
    let hdg = Heading::from_raw_128ths(270 * 128).unwrap();
    tracker.update(
        &TargetUpdate::new(
            AddressType::Icao,
            addr,
            TransponderSource::ModeS1090,
            ReceptionSource::Direct,
            300,
        )
        .with_velocity(Some(420), Some(hdg), Some(-1200)),
    );

    // Step 4: Mode A identity message adds squawk
    tracker.update(
        &TargetUpdate::new(
            AddressType::Icao,
            addr,
            TransponderSource::ModeS1090,
            ReceptionSource::Direct,
            400,
        )
        .with_squawk(Squawk::new(0o4712).unwrap()),
    );

    let target = tracker.get(AddressType::Icao, addr).unwrap();

    // Verify all fields merged monotonically and preserved
    assert_eq!(target.callsign, Some(*b"DAL456  "));
    assert_eq!(target.position, Some(pos));
    assert_eq!(
        target.altitude,
        Some(Altitude::new(24000, AltitudeKind::Barometric).unwrap())
    );
    assert_eq!(target.velocity.ground_speed_knots, Some(420));
    assert_eq!(target.velocity.heading, Some(hdg));
    assert_eq!(target.velocity.vertical_rate_fpm, Some(-1200));
    assert_eq!(target.squawk, Some(Squawk::new(0o4712).unwrap()));
    assert_eq!(target.last_seen_ms, 400);

    // Step 5: Altitude update replaces only altitude, leaving everything else intact
    tracker.update(
        &TargetUpdate::new(
            AddressType::Icao,
            addr,
            TransponderSource::ModeS1090,
            ReceptionSource::Direct,
            500,
        )
        .with_altitude(Altitude::new(23000, AltitudeKind::Barometric).unwrap()),
    );

    let target2 = tracker.get(AddressType::Icao, addr).unwrap();
    assert_eq!(
        target2.altitude,
        Some(Altitude::new(23000, AltitudeKind::Barometric).unwrap())
    );
    assert_eq!(target2.callsign, Some(*b"DAL456  "));
    assert_eq!(target2.position, Some(pos));
    assert_eq!(target2.velocity.ground_speed_knots, Some(420));
    assert_eq!(target2.last_seen_ms, 500);
}
