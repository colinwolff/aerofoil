//! Unit types: fixed-point altitude, squawk and heading (`docs/SPEC.md` Invariant 9, §6).
//!
//! Integration tests, because the crate is `#![no_std]` and the harness needs `std` (`AGENTS.md`
//! §3.2).

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_common::{Altitude, AltitudeKind, Heading, Squawk};

// ---------------------------------------------------------------- altitude

#[test]
fn altitude_accepts_the_representable_ends() {
    assert!(Altitude::new(Altitude::MIN_FEET, AltitudeKind::Barometric).is_some());
    assert!(Altitude::new(Altitude::MAX_FEET, AltitudeKind::Geometric).is_some());
}

#[test]
fn altitude_refuses_out_of_range_instead_of_clamping() {
    assert!(Altitude::new(Altitude::MIN_FEET - 1, AltitudeKind::Barometric).is_none());
    assert!(Altitude::new(Altitude::MAX_FEET + 1, AltitudeKind::Geometric).is_none());
}

#[test]
fn altitude_keeps_its_datum() {
    let baro = Altitude::new(35_000, AltitudeKind::Barometric).unwrap();
    let geo = Altitude::new(35_000, AltitudeKind::Geometric).unwrap();
    assert_eq!(baro.kind(), AltitudeKind::Barometric);
    assert_eq!(geo.kind(), AltitudeKind::Geometric);
    assert_ne!(baro.kind(), geo.kind());
    assert_eq!(baro.feet(), 35_000);
}

#[test]
fn altitude_display_is_whole_feet() {
    assert_eq!(
        Altitude::new(-1_000, AltitudeKind::Barometric)
            .unwrap()
            .to_string(),
        "-1000 ft"
    );
    assert_eq!(
        Altitude::new(35_000, AltitudeKind::Geometric)
            .unwrap()
            .to_string(),
        "35000 ft"
    );
}

// ---------------------------------------------------------------- squawk

#[test]
fn squawk_accepts_every_twelve_bit_code() {
    assert_eq!(Squawk::new(0).unwrap().code(), 0);
    assert_eq!(Squawk::new(0o7777).unwrap().code(), 0o7777);
    assert_eq!(Squawk::new(0o1777).unwrap().code(), 0o1777);
    // 0x0ABC is 0o5274: an odd-looking but perfectly legal code.
    assert_eq!(Squawk::new(0x0ABC).unwrap().code(), 0x0ABC);
}

#[test]
fn squawk_refuses_more_than_twelve_bits() {
    // A hex-nibble rendering (digits 8-F) lands above the ceiling and is refused, not reinterpreted.
    assert!(Squawk::new(0x1000).is_none());
    assert!(Squawk::new(0xABCD).is_none());
    assert!(Squawk::new(u16::MAX).is_none());
}

#[test]
fn squawk_display_is_four_octal_digits() {
    assert_eq!(Squawk::new(0).unwrap().to_string(), "0000");
    assert_eq!(Squawk::new(0o700).unwrap().to_string(), "0700");
    assert_eq!(Squawk::new(0o7777).unwrap().to_string(), "7777");
    assert_eq!(Squawk::new(0x0ABC).unwrap().to_string(), "5274");
}

// ---------------------------------------------------------------- heading

#[test]
fn heading_accepts_up_to_one_turn_minus_one_unit() {
    assert_eq!(Heading::from_raw_128ths(0).unwrap().raw_128ths(), 0);
    let last = Heading::UNIT_PER_TURN_LAST;
    assert_eq!(Heading::from_raw_128ths(last).unwrap().raw_128ths(), last);
    assert!(Heading::from_raw_128ths(Heading::UNITS_PER_TURN).is_none());
    assert!(Heading::from_raw_128ths(u16::MAX).is_none());
}

#[test]
fn heading_uses_integer_math_for_degrees() {
    let cases = [
        (0u16, "0.0"),
        (64, "0.5"),
        (128, "1.0"),
        (45_440, "355.0"),
        (Heading::UNIT_PER_TURN_LAST, "359.9"),
    ];
    for (raw, expected) in cases {
        let heading = Heading::from_raw_128ths(raw).unwrap();
        assert_eq!(
            heading.to_string(),
            format!("{expected}\u{00b0}"),
            "raw {raw}"
        );
    }
}

#[test]
fn heading_whole_and_tenths_agree_with_display() {
    let heading = Heading::from_raw_128ths(123 * 128 + 57).unwrap();
    assert_eq!(heading.whole_degrees(), 123);
    assert_eq!(heading.tenths(), 4); // 57/128 = 0.445 -> 4 tenths
    assert_eq!(heading.to_string(), "123.4\u{00b0}");
}

// ---------------------------------------------------------------- layout

#[test]
fn unit_types_are_two_bytes() {
    assert_eq!(core::mem::size_of::<Squawk>(), 2);
    assert_eq!(core::mem::size_of::<Heading>(), 2);
}
