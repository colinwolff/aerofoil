//! Tests for Multilateration (MLAT) reception provenance and deduplication.

use aerofoil_common::{
    AddressType, Latitude, Longitude, Position, ReceptionSource, TransponderSource,
};
use aerofoil_tracker::{TargetUpdate, Tracker};

#[test]
fn test_mlat_populates_unpositioned_target() {
    let tracker = Tracker::new();
    let addr = 0x4CA705;

    // Mode S DF11 ping without position
    let ping = TargetUpdate::new(
        AddressType::Icao,
        addr,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        1_000,
    );
    tracker.update(&ping);

    let target1 = tracker.get(AddressType::Icao, addr);
    assert!(target1.is_some());
    let Some(t1) = target1 else { panic!() };
    assert_eq!(t1.position, None);
    assert_eq!(t1.reception, ReceptionSource::Direct);

    // Incoming MLAT solution provides position
    let mlat_pos = Position::new(
        Latitude::from_microdegrees(52_367_600).unwrap_or_default(),
        Longitude::from_microdegrees(4_904_100).unwrap_or_default(),
    );
    let mlat_update = TargetUpdate::new(
        AddressType::Icao,
        addr,
        TransponderSource::ModeS1090,
        ReceptionSource::Mlat,
        1_050,
    )
    .with_position(mlat_pos);

    tracker.update(&mlat_update);

    let target2 = tracker.get(AddressType::Icao, addr);
    assert!(target2.is_some());
    let Some(t2) = target2 else { panic!() };
    assert_eq!(t2.position, Some(mlat_pos));
    assert_eq!(t2.reception, ReceptionSource::Mlat);
}

#[test]
fn test_direct_adsb_position_not_overwritten_by_mlat() {
    let tracker = Tracker::new();
    let addr = 0x4840D6;

    let gnss_pos = Position::new(
        Latitude::from_microdegrees(52_300_000).unwrap_or_default(),
        Longitude::from_microdegrees(4_700_000).unwrap_or_default(),
    );

    // Direct ADS-B update with high-precision GNSS position
    let adsb = TargetUpdate::new(
        AddressType::Icao,
        addr,
        TransponderSource::ModeS1090,
        ReceptionSource::Direct,
        1_000,
    )
    .with_position(gnss_pos);
    tracker.update(&adsb);

    // MLAT update arrives with slightly different approximate position
    let mlat_pos = Position::new(
        Latitude::from_microdegrees(52_300_500).unwrap_or_default(),
        Longitude::from_microdegrees(4_700_500).unwrap_or_default(),
    );
    let mlat = TargetUpdate::new(
        AddressType::Icao,
        addr,
        TransponderSource::ModeS1090,
        ReceptionSource::Mlat,
        1_020,
    )
    .with_position(mlat_pos);
    tracker.update(&mlat);

    let target = tracker.get(AddressType::Icao, addr);
    assert!(target.is_some());
    let Some(t) = target else { panic!() };
    // Direct GNSS position must be preserved!
    assert_eq!(t.position, Some(gnss_pos));
    assert_eq!(t.reception, ReceptionSource::Direct);
}
