//! Verification tests for [`Tracker`] and [`AddressFilter`] (`ADR-0004`, `ADR-0005`).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_common::{
    AddressFilter, AddressType, AircraftTarget, ReceptionSource, TransponderSource,
};
use aerofoil_tracker::{NUM_SHARDS, Tracker, shard_index};

#[test]
fn test_shard_indexing() {
    assert_eq!(NUM_SHARDS, 64);
    assert_eq!(shard_index(0x000000), 0);
    assert_eq!(shard_index(0x000001), 1);
    assert_eq!(shard_index(0x00003F), 63);
    assert_eq!(shard_index(0x000040), 0);
    assert_eq!(shard_index(0x4840D6), 0x4840D6_usize & 63);
}

#[test]
fn test_address_filter_implementation() {
    let tracker = Tracker::new();
    assert!(tracker.is_empty());
    assert_eq!(tracker.len(), 0);

    // Initial query on empty tracker
    assert!(!tracker.contains_address(0x4840D6));
    assert!(!AddressFilter::contains(&tracker, 0x4840D6));

    // Insert an ICAO target
    let target = AircraftTarget::new(
        AddressType::Icao,
        0x4840D6,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        1_000_000,
    );
    assert!(tracker.insert(target).is_none());

    // Both Tracker method and AddressFilter trait return true
    assert_eq!(tracker.len(), 1);
    assert!(tracker.contains_address(0x4840D6));
    assert!(AddressFilter::contains(&tracker, 0x4840D6));

    // Other addresses return false
    assert!(!AddressFilter::contains(&tracker, 0x4840D7));
    assert!(!AddressFilter::contains(&tracker, 0x123456));
}

#[test]
fn test_non_icao_address_filtering() {
    let tracker = Tracker::new();

    // Anonymous UAT self-assigned target with address 0xAABBCC
    let target = AircraftTarget::new(
        AddressType::Anonymous,
        0xAABBCC,
        TransponderSource::Uat978,
        ReceptionSource::Direct,
        1_000_000,
    );
    tracker.insert(target);

    // Target is in tracker
    assert_eq!(tracker.len(), 1);
    assert!(tracker.get(AddressType::Anonymous, 0xAABBCC).is_some());

    // But AddressFilter (for 1090ES error correction) checks ICAO tracks only
    assert!(!AddressFilter::contains(&tracker, 0xAABBCC));
    assert!(!tracker.contains_address(0xAABBCC));
}

#[test]
fn test_snapshot_and_retain() {
    let tracker = Tracker::new();

    for addr in 0..100 {
        let target = AircraftTarget::new(
            AddressType::Icao,
            addr,
            TransponderSource::ModeS1090,
            ReceptionSource::Direct,
            addr as u64 * 1000,
        );
        tracker.insert(target);
    }

    assert_eq!(tracker.len(), 100);
    let snap = tracker.snapshot();
    assert_eq!(snap.len(), 100);

    // Retain only even addresses
    let removed = tracker.retain(|t| t.address % 2 == 0);
    assert_eq!(removed, 50);
    assert_eq!(tracker.len(), 50);

    // Verify even addresses remain
    for addr in 0..100 {
        let should_exist = addr % 2 == 0;
        assert_eq!(tracker.contains_address(addr), should_exist);
    }
}
