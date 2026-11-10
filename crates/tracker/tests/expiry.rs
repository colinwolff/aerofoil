//! Tests for TTL track expiry, pruning, and staleness detection (`docs/SPEC.md` Invariant 10).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_common::{AddressType, AirspaceEvent, ReceptionSource, TransponderSource};
use aerofoil_tracker::{TargetUpdate, Tracker};

#[test]
fn test_ttl_expiry_and_pruning() {
    let tracker = Tracker::new();

    // Target 1: seen at t=1,000
    tracker.update(&TargetUpdate::new(
        AddressType::Icao,
        0x111111,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        1_000,
    ));

    // Target 2: seen at t=20,000
    tracker.update(&TargetUpdate::new(
        AddressType::Icao,
        0x222222,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        20_000,
    ));

    // Target 3: seen at t=55,000
    tracker.update(&TargetUpdate::new(
        AddressType::Icao,
        0x333333,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        55_000,
    ));

    assert_eq!(tracker.len(), 3);

    // At current_time = 62,000 with TTL = 60,000 (60s):
    // Target 1 age = 62,000 - 1,000 = 61,000 >= 60,000 -> Expired!
    // Target 2 age = 62,000 - 20,000 = 42,000 < 60,000 -> Active!
    // Target 3 age = 62,000 - 55,000 = 7,000 < 60,000 -> Active!
    let lost_events = tracker.prune_expired(62_000, Tracker::DEFAULT_TRACK_TTL_MS);
    assert_eq!(lost_events.len(), 1);

    match lost_events[0] {
        AirspaceEvent::TargetLost {
            track_key,
            timestamp_ms,
        } => {
            assert_eq!(track_key, (AddressType::Icao, 0x111111));
            assert_eq!(timestamp_ms, 62_000);
        }
        _ => panic!("expected TargetLost event"),
    }

    assert_eq!(tracker.len(), 2);
    assert!(!tracker.contains_address(0x111111));
    assert!(tracker.contains_address(0x222222));
    assert!(tracker.contains_address(0x333333));
}

#[test]
fn test_stale_detection() {
    let target = aerofoil_common::AircraftTarget::new(
        AddressType::Icao,
        0x123456,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        10_000,
    );

    // At t=20,000, age = 10,000 ms < 15,000 ms -> not stale
    assert!(!Tracker::is_stale(&target, 20_000));

    // At t=25,000, age = 15,000 ms >= 15,000 ms -> stale
    assert!(Tracker::is_stale(&target, 25_000));
}
