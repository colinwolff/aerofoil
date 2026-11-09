//! Global CPR airborne decoding integration tests (DO-260B §2.2.3.2.5).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_common::cpr::{
    CPR_MODULUS, CprError, MAX_PAIR_AGE_MS, RawCpr, decode_airborne_cpr_raw, decode_cpr_global,
};

#[test]
fn reference_position_reproduced_odd_newer() {
    // pyModeS / dump1090 reference pair:
    // Even msg 8D40058B58C901375147EFD09357 (t = 1000)
    // Odd  msg 8D40058B58C904A87F402D3B8C59 (t = 2500)
    let even = RawCpr::new(false, 39_848, 83_951, 1_000).unwrap();
    let odd = RawCpr::new(true, 21_567, 81_965, 2_500).unwrap();

    let pos = decode_cpr_global(&even, &odd).unwrap();
    let (lat, lon) = pos.to_f64();

    assert!((lat - 49.817551).abs() < 1e-4);
    assert!((lon - 6.084422).abs() < 1e-4);
}

#[test]
fn reference_position_reproduced_even_newer() {
    // Same pair with even frame received later:
    let odd = RawCpr::new(true, 21_567, 81_965, 1_000).unwrap();
    let even = RawCpr::new(false, 39_848, 83_951, 2_500).unwrap();

    let pos = decode_cpr_global(&odd, &even).unwrap();
    let (lat, lon) = pos.to_f64();

    assert!((lat - 49.824097).abs() < 1e-4);
    assert!((lon - 6.067850).abs() < 1e-4);
}

#[test]
fn pairs_older_than_ten_seconds_are_rejected() {
    let even = RawCpr::new(false, 39_848, 83_951, 0).unwrap();
    let odd_valid = RawCpr::new(true, 21_567, 81_965, MAX_PAIR_AGE_MS).unwrap();
    let odd_expired = RawCpr::new(true, 21_567, 81_965, MAX_PAIR_AGE_MS + 1).unwrap();

    assert!(decode_cpr_global(&even, &odd_valid).is_ok());

    match decode_cpr_global(&even, &odd_expired) {
        Err(CprError::PairWindowExceeded { delta_ms }) => {
            assert_eq!(delta_ms, MAX_PAIR_AGE_MS + 1);
        }
        other => panic!("expected PairWindowExceeded, got {other:?}"),
    }
}

#[test]
fn same_parity_frames_are_rejected() {
    let even1 = RawCpr::new(false, 39_848, 83_951, 1_000).unwrap();
    let even2 = RawCpr::new(false, 39_848, 83_951, 2_000).unwrap();
    assert_eq!(decode_cpr_global(&even1, &even2), Err(CprError::SameParity));

    let odd1 = RawCpr::new(true, 21_567, 81_965, 1_000).unwrap();
    let odd2 = RawCpr::new(true, 21_567, 81_965, 2_000).unwrap();
    assert_eq!(decode_cpr_global(&odd1, &odd2), Err(CprError::SameParity));
}

#[test]
fn zone_mismatch_is_rejected_and_never_snapped() {
    // Synthetic pair spanning across the 10.470471° NL transition boundary:
    // even_lat = 97659 -> lat_even ≈ 10.470474° (NL = 58)
    // odd_lat  = 93825 -> lat_odd  ≈ 10.469459° (NL = 59)
    let res = decode_airborne_cpr_raw(97_659, 50_000, 93_825, 50_000, true);
    match res {
        Err(CprError::ZoneMismatch { nl_even, nl_odd }) => {
            assert_eq!(nl_even, 58);
            assert_eq!(nl_odd, 59);
        }
        other => panic!("expected ZoneMismatch, got {other:?}"),
    }
}

#[test]
fn southern_hemisphere_decoding() {
    // Sydney: lat ≈ -33.8688°, lon ≈ 151.2093°
    // elat = 38555, olat = 48512, elon = 32800, olon = 27150
    let res = decode_airborne_cpr_raw(38_555, 32_800, 48_512, 27_150, true);
    assert!(res.is_ok());
    let pos = res.unwrap();
    assert!(pos.lat().microdegrees() < 0);
    assert!(pos.lon().microdegrees() > 0);
}

#[test]
fn out_of_range_cpr_coordinates_refused() {
    assert!(RawCpr::new(false, CPR_MODULUS, 0, 0).is_none());
    assert!(RawCpr::new(false, 0, CPR_MODULUS, 0).is_none());

    assert_eq!(
        decode_airborne_cpr_raw(CPR_MODULUS, 0, 0, 0, true),
        Err(CprError::OutOfRangeCoordinate { value: CPR_MODULUS })
    );
}
