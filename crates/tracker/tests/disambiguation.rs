//! Target key space disambiguation tests (`docs/SPEC.md` Invariant 10).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_common::{AddressType, ReceptionSource, TransponderSource};
use aerofoil_tracker::{TargetUpdate, Tracker};

#[test]
fn test_address_type_isolation_disallows_hijack() {
    let tracker = Tracker::new();
    let common_addr = 0x555555;

    // Track 1: Standard ICAO direct reception
    tracker.update(
        &TargetUpdate::new(
            AddressType::Icao,
            common_addr,
            TransponderSource::ModeS1090,
            ReceptionSource::Direct,
            1_000,
        )
        .with_callsign(*b"DIRECT1 "),
    );

    // Track 2: TIS-B track file address with identical 24-bit numeric value
    tracker.update(
        &TargetUpdate::new(
            AddressType::TisbTrack,
            common_addr,
            TransponderSource::Uat978,
            ReceptionSource::Rebroadcast,
            1_100,
        )
        .with_callsign(*b"TISB2   "),
    );

    // Both tracks must coexist independently without collision or hijack
    assert_eq!(tracker.len(), 2);
    let t_icao = tracker.get(AddressType::Icao, common_addr).unwrap();
    let t_tisb = tracker.get(AddressType::TisbTrack, common_addr).unwrap();

    assert_eq!(t_icao.callsign, Some(*b"DIRECT1 "));
    assert_eq!(t_icao.reception, ReceptionSource::Direct);
    assert_eq!(t_tisb.callsign, Some(*b"TISB2   "));
    assert_eq!(t_tisb.reception, ReceptionSource::Rebroadcast);
}
