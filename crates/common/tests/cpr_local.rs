//! Local CPR airborne decoding integration tests (DO-260B §2.2.3.2.6).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_common::Position;
use aerofoil_common::cpr::{
    CPR_MODULUS, CprError, RawCpr, decode_airborne_cpr_local_raw, decode_cpr_global,
    decode_cpr_local,
};

#[test]
fn local_decoding_matches_reference_positions() {
    // Reference pair from pyModeS / dump1090:
    // Even msg 8D40058B58C901375147EFD09357 (lat_raw = 39_848, lon_raw = 83_951)
    // Odd  msg 8D40058B58C904A87F402D3B8C59 (lat_raw = 21_567, lon_raw = 81_965)
    let even = RawCpr::new(false, 39_848, 83_951, 1_000).unwrap();
    let odd = RawCpr::new(true, 21_567, 81_965, 2_000).unwrap();

    // Receiver reference position in Luxembourg (50.0°, 6.0°):
    let ref_pos = Position::from_microdegrees(50_000_000, 6_000_000).unwrap();

    // Decode even frame locally:
    let pos_even = decode_cpr_local(&even, ref_pos).unwrap();
    assert_eq!(pos_even.lat().microdegrees(), 49_824_097);
    assert_eq!(pos_even.lon().microdegrees(), 6_067_850);

    // Decode odd frame locally:
    let pos_odd = decode_cpr_local(&odd, ref_pos).unwrap();
    assert_eq!(pos_odd.lat().microdegrees(), 49_817_551);
    assert_eq!(pos_odd.lon().microdegrees(), 6_084_422);
}

#[test]
fn local_decoding_agrees_with_global_decoding() {
    let even_early = RawCpr::new(false, 39_848, 83_951, 1_000).unwrap();
    let odd = RawCpr::new(true, 21_567, 81_965, 2_000).unwrap();
    let even_late = RawCpr::new(false, 39_848, 83_951, 3_000).unwrap();

    let pos_global_even_newer = decode_cpr_global(&odd, &even_late).unwrap();
    let pos_local_even = decode_cpr_local(&even_late, pos_global_even_newer).unwrap();
    assert_eq!(pos_global_even_newer, pos_local_even);

    let pos_global_odd_newer = decode_cpr_global(&even_early, &odd).unwrap();
    let pos_local_odd = decode_cpr_local(&odd, pos_global_odd_newer).unwrap();
    assert_eq!(pos_global_odd_newer, pos_local_odd);
}

#[test]
fn southern_hemisphere_local_decoding() {
    let ref_pos = Position::from_microdegrees(-28_000_000, 16_000_000).unwrap();
    let pos = decode_airborne_cpr_local_raw(false, 38_555, 32_800, ref_pos).unwrap();

    assert_eq!(pos.lat().microdegrees(), -28_235_092);
    assert!(pos.lat().microdegrees() < 0);
    assert!(pos.lon().microdegrees() > 0);
}

#[test]
fn western_hemisphere_negative_longitude_local_decoding() {
    // San Francisco reference position (37.7749°, -122.4194°):
    let ref_pos = Position::from_microdegrees(37_774_900, -122_419_400).unwrap();
    // Encoded CPR for San Francisco:
    let pos = decode_airborne_cpr_local_raw(false, 38_773, 2_289, ref_pos).unwrap();

    assert!(pos.lon().microdegrees() < 0);
    let (lat, lon) = pos.to_f64();
    assert!((lat - 37.7749).abs() < 1e-4);
    assert!((lon - -122.4194).abs() < 1e-4);
}

#[test]
fn out_of_range_coordinates_refused() {
    let ref_pos = Position::from_microdegrees(0, 0).unwrap();
    assert_eq!(
        decode_airborne_cpr_local_raw(false, CPR_MODULUS, 0, ref_pos),
        Err(CprError::OutOfRangeCoordinate { value: CPR_MODULUS })
    );
    assert_eq!(
        decode_airborne_cpr_local_raw(false, 0, CPR_MODULUS, ref_pos),
        Err(CprError::OutOfRangeCoordinate { value: CPR_MODULUS })
    );
}
