#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_common::{
    AddressType, AircraftTarget, AirspaceEvent, Altitude, AltitudeKind, Heading, Position,
    ReceptionSource, Squawk, TransponderSource, Velocity,
};

#[test]
fn address_type_properties() {
    let icao = AddressType::Icao;
    let anon = AddressType::Anonymous;
    let tisb_icao = AddressType::TisbIcao;
    let tisb_track = AddressType::TisbTrack;
    let vehicle = AddressType::SurfaceVehicle;
    let beacon = AddressType::GroundBeacon;

    assert_eq!(icao, AddressType::Icao);
    assert_ne!(icao, anon);
    assert_ne!(tisb_icao, tisb_track);
    assert_ne!(vehicle, beacon);

    // Ord & Hash
    assert!(icao < anon);
}

#[test]
fn transponder_and_reception_sources() {
    assert_ne!(TransponderSource::ModeS1090, TransponderSource::Uat978);
    assert_ne!(ReceptionSource::Direct, ReceptionSource::Rebroadcast);
}

#[test]
fn velocity_construction_and_defaults() {
    let default_vel = Velocity::default();
    assert_eq!(default_vel.ground_speed_knots, None);
    assert_eq!(default_vel.heading, None);
    assert_eq!(default_vel.vertical_rate_fpm, None);

    let hdg = Heading::from_raw_128ths(270 * 128);
    let vel = Velocity::new(Some(450), hdg, Some(-1500));
    assert_eq!(vel.ground_speed_knots, Some(450));
    assert_eq!(vel.heading, hdg);
    assert_eq!(vel.vertical_rate_fpm, Some(-1500));
}

#[test]
fn aircraft_target_lifecycle_and_track_key() {
    let mut target = AircraftTarget::new(
        AddressType::Icao,
        0xA12345,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        1_700_000_000_000,
    );

    assert_eq!(target.track_key(), (AddressType::Icao, 0xA12345));
    assert_eq!(target.callsign, None);
    assert_eq!(target.position, None);
    assert_eq!(target.altitude, None);
    assert_eq!(target.velocity, Velocity::default());
    assert_eq!(target.squawk, None);
    assert_eq!(target.emitter_category, None);
    assert_eq!(target.nic, None);
    assert_eq!(target.last_seen_ms, 1_700_000_000_000);

    // Update target fields
    target.callsign = Some(*b"AAL123  ");
    target.position = Position::from_microdegrees(37_618_800, -122_375_400);
    target.altitude = Altitude::new(35_000, AltitudeKind::Barometric);
    target.velocity = Velocity::new(Some(480), Heading::from_raw_128ths(90 * 128), Some(0));
    target.squawk = Squawk::new(0o1200);
    target.emitter_category = Some(1);
    target.nic = Some(8);
    target.last_seen_ms += 1000;

    assert_eq!(target.callsign, Some(*b"AAL123  "));
    assert_eq!(target.squawk, Squawk::new(0o1200));
    assert_eq!(target.last_seen_ms, 1_700_000_001_000);
}

#[test]
fn airspace_events() {
    let target = AircraftTarget::new(
        AddressType::Anonymous,
        0x543210,
        TransponderSource::Uat978,
        ReceptionSource::Rebroadcast,
        5000,
    );

    let acquired = AirspaceEvent::TargetAcquired(target);
    let updated = AirspaceEvent::TargetUpdated(target);
    let lost = AirspaceEvent::TargetLost {
        track_key: target.track_key(),
        timestamp_ms: 10000,
    };

    match acquired {
        AirspaceEvent::TargetAcquired(t) => assert_eq!(t.address, 0x543210),
        _ => panic!("expected TargetAcquired"),
    }

    match updated {
        AirspaceEvent::TargetUpdated(t) => assert_eq!(t.reception, ReceptionSource::Rebroadcast),
        _ => panic!("expected TargetUpdated"),
    }

    match lost {
        AirspaceEvent::TargetLost {
            track_key,
            timestamp_ms,
        } => {
            assert_eq!(track_key, (AddressType::Anonymous, 0x543210));
            assert_eq!(timestamp_ms, 10000);
        }
        _ => panic!("expected TargetLost"),
    }
}
