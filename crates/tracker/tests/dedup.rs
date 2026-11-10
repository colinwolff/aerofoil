//! ADS-R cross-band deduplication and target disambiguation tests (`docs/SPEC.md` Invariant 10).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_common::{
    AddressType, Altitude, AltitudeKind, Latitude, Longitude, Position, ReceptionSource,
    TransponderSource,
};
use aerofoil_tracker::{TargetUpdate, Tracker};

#[test]
fn test_direct_reception_always_wins() {
    let tracker = Tracker::new();
    let addr = 0x123456;
    let pos = Position::new(
        Latitude::from_microdegrees(40_000_000).unwrap(),
        Longitude::from_microdegrees(-74_000_000).unwrap(),
    );

    // Initial update via rebroadcast
    let u1 = TargetUpdate::new(
        AddressType::Icao,
        addr,
        TransponderSource::Uat978,
        ReceptionSource::Rebroadcast,
        1_000,
    )
    .with_position(pos);
    let event1 = tracker.update(&u1);
    assert!(event1.is_some());
    assert_eq!(
        tracker.get(AddressType::Icao, addr).unwrap().reception,
        ReceptionSource::Rebroadcast
    );

    // Subsequent direct update arriving 200 ms later at the exact same position
    let u2 = TargetUpdate::new(
        AddressType::Icao,
        addr,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        1_200,
    )
    .with_position(pos);
    let event2 = tracker.update(&u2);
    // Direct reception is NEVER deduplicated - direct reception always wins
    assert!(event2.is_some());
    let target = tracker.get(AddressType::Icao, addr).unwrap();
    assert_eq!(target.reception, ReceptionSource::Direct);
    assert_eq!(target.last_seen_ms, 1_200);
}

#[test]
fn test_rebroadcast_within_spatiotemporal_window_deduplicated() {
    let tracker = Tracker::new();
    let addr = 0x4840D6;
    let pos_direct = Position::new(
        Latitude::from_microdegrees(37_618_800).unwrap(),
        Longitude::from_microdegrees(-122_375_400).unwrap(),
    );

    // Direct update at t = 10,000 ms
    let direct_update = TargetUpdate::new(
        AddressType::Icao,
        addr,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        10_000,
    )
    .with_position(pos_direct)
    .with_altitude(Altitude::new(10000, AltitudeKind::Barometric).unwrap());
    assert!(tracker.update(&direct_update).is_some());

    // Rebroadcast arriving at t = 10,400 ms (Δt = 400 ms ≤ 1.0 s)
    // Position offset by 300 micro-degrees (0.0003° ≤ 0.001°)
    let pos_rebroadcast = Position::new(
        Latitude::from_microdegrees(37_619_100).unwrap(),
        Longitude::from_microdegrees(-122_375_100).unwrap(),
    );
    let rebroadcast_update = TargetUpdate::new(
        AddressType::Icao,
        addr,
        TransponderSource::Uat978,
        ReceptionSource::Rebroadcast,
        10_400,
    )
    .with_position(pos_rebroadcast)
    .with_altitude(Altitude::new(10100, AltitudeKind::Barometric).unwrap());

    // Must be suppressed (deduplicated)
    let event = tracker.update(&rebroadcast_update);
    assert!(event.is_none(), "expected rebroadcast to be deduplicated");

    // Track state must be unchanged from direct reception
    let target = tracker.get(AddressType::Icao, addr).unwrap();
    assert_eq!(target.reception, ReceptionSource::Direct);
    assert_eq!(target.last_seen_ms, 10_000);
    assert_eq!(target.position, Some(pos_direct));
    assert_eq!(
        target.altitude,
        Some(Altitude::new(10000, AltitudeKind::Barometric).unwrap())
    );
}

#[test]
fn test_rebroadcast_outside_temporal_window_admitted() {
    let tracker = Tracker::new();
    let addr = 0xABCDEF;
    let pos = Position::new(
        Latitude::from_microdegrees(37_618_800).unwrap(),
        Longitude::from_microdegrees(-122_375_400).unwrap(),
    );

    // Direct update at t = 10_000 ms
    tracker.update(
        &TargetUpdate::new(
            AddressType::Icao,
            addr,
            TransponderSource::ModeS1090,
            ReceptionSource::Direct,
            10_000,
        )
        .with_position(pos),
    );

    // Rebroadcast arriving at t = 11_500 ms (Δt = 1,500 ms > 1.0 s)
    let rebroadcast = TargetUpdate::new(
        AddressType::Icao,
        addr,
        TransponderSource::Uat978,
        ReceptionSource::Rebroadcast,
        11_500,
    )
    .with_position(pos);

    let event = tracker.update(&rebroadcast);
    assert!(
        event.is_some(),
        "rebroadcast outside 1.0s window must be accepted"
    );

    let target = tracker.get(AddressType::Icao, addr).unwrap();
    assert_eq!(target.reception, ReceptionSource::Rebroadcast);
    assert_eq!(target.last_seen_ms, 11_500);
}

#[test]
fn test_rebroadcast_outside_spatial_window_admitted() {
    let tracker = Tracker::new();
    let addr = 0xCAFE01;
    let pos1 = Position::new(
        Latitude::from_microdegrees(37_618_800).unwrap(),
        Longitude::from_microdegrees(-122_375_400).unwrap(),
    );

    // Direct update at t = 10_000 ms
    tracker.update(
        &TargetUpdate::new(
            AddressType::Icao,
            addr,
            TransponderSource::ModeS1090,
            ReceptionSource::Direct,
            10_000,
        )
        .with_position(pos1),
    );

    // Rebroadcast at t = 10_200 ms (Δt = 200 ms ≤ 1.0 s)
    // But latitude differs by 5000 micro-degrees (0.005° > 0.001°)
    let pos2 = Position::new(
        Latitude::from_microdegrees(37_623_800).unwrap(),
        Longitude::from_microdegrees(-122_375_400).unwrap(),
    );
    let rebroadcast = TargetUpdate::new(
        AddressType::Icao,
        addr,
        TransponderSource::Uat978,
        ReceptionSource::Rebroadcast,
        10_200,
    )
    .with_position(pos2);

    let event = tracker.update(&rebroadcast);
    assert!(
        event.is_some(),
        "rebroadcast outside 0.001° spatial window must be accepted"
    );

    let target = tracker.get(AddressType::Icao, addr).unwrap();
    assert_eq!(target.position, Some(pos2));
    assert_eq!(target.last_seen_ms, 10_200);
}
