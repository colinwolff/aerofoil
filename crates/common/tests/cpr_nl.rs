//! CPR NL transition table and zone math tests (DO-260B §2.2.3.2.5).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_common::Latitude;
use aerofoil_common::cpr::{
    DLAT_EVEN_DEGREES, DLAT_EVEN_MICRODEGREES, DLAT_ODD_DEGREES, LATITUDE_ZONES_EVEN,
    LATITUDE_ZONES_ODD, NL_TRANSITION_TABLE, cpr_n, cpr_nl, cpr_nl_from_microdegrees, dlon_degrees,
};

#[test]
fn zone_constants_match_specification() {
    assert_eq!(LATITUDE_ZONES_EVEN, 60);
    assert_eq!(LATITUDE_ZONES_ODD, 59);
    assert_eq!(DLAT_EVEN_DEGREES, 6.0);
    assert_eq!(DLAT_EVEN_MICRODEGREES, 6_000_000);
    assert!((DLAT_ODD_DEGREES - (360.0 / 59.0)).abs() < 1e-12);
    assert_eq!(NL_TRANSITION_TABLE.len(), 60);
}

#[test]
fn nl_equator_and_poles() {
    let eq = Latitude::from_degrees_whole(0).unwrap();
    assert_eq!(cpr_nl(eq), 59);

    let near_pole = Latitude::from_degrees_whole(87).unwrap();
    assert_eq!(cpr_nl(near_pole), 1);

    let north_pole = Latitude::from_degrees_whole(90).unwrap();
    assert_eq!(cpr_nl(north_pole), 1);

    let south_pole = Latitude::from_degrees_whole(-90).unwrap();
    assert_eq!(cpr_nl(south_pole), 1);
}

#[test]
fn nl_symmetry_across_equator() {
    for deg in 0..=90 {
        let north = Latitude::from_degrees_whole(deg).unwrap();
        let south = Latitude::from_degrees_whole(-deg).unwrap();
        assert_eq!(cpr_nl(north), cpr_nl(south));
    }
}

#[test]
fn nl_exhaustive_boundary_transitions() {
    for nl in (2..=59).rev() {
        let threshold = NL_TRANSITION_TABLE[nl];

        let below = cpr_nl_from_microdegrees(threshold - 1);
        assert_eq!(
            below, nl as u8,
            "1 micro-degree below threshold {threshold} must yield NL={nl}"
        );

        let at = cpr_nl_from_microdegrees(threshold);
        assert_eq!(
            at,
            (nl - 1) as u8,
            "At threshold {threshold} must transition to NL={}",
            nl - 1
        );
    }
}

#[test]
fn cpr_n_odd_and_even_zones() {
    let eq = Latitude::from_degrees_whole(0).unwrap();
    assert_eq!(cpr_n(eq, false), 59);
    assert_eq!(cpr_n(eq, true), 58);

    let pole = Latitude::from_degrees_whole(88).unwrap();
    assert_eq!(cpr_n(pole, false), 1);
    assert_eq!(cpr_n(pole, true), 1);
}

#[test]
fn dlon_degrees_computation() {
    let eq = Latitude::from_degrees_whole(0).unwrap();
    assert!((dlon_degrees(eq, false) - (360.0 / 59.0)).abs() < 1e-12);
    assert!((dlon_degrees(eq, true) - (360.0 / 58.0)).abs() < 1e-12);

    let pole = Latitude::from_degrees_whole(90).unwrap();
    assert_eq!(dlon_degrees(pole, false), 360.0);
    assert_eq!(dlon_degrees(pole, true), 360.0);
}
