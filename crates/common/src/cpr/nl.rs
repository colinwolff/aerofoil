//! Compact Position Reporting (CPR) transition table and zone math.
//!
//! RTCA DO-260B §2.2.3.2.5 defines the CPR compression scheme for airborne and surface positions.
//! In accordance with `docs/SPEC.md` Invariant 9, the longitude transition table $NL(\text{lat})$ is
//! precomputed as a fixed 60-entry array of integer micro-degree thresholds, preserving bit-exact
//! results across platforms and `#![no_std]` targets without floating-point trigonometric drift.

use crate::Latitude;

/// Number of latitude zones in an even ($i = 0$) CPR message ($360^\circ / 6^\circ = 60$).
pub const LATITUDE_ZONES_EVEN: u32 = 60;

/// Number of latitude zones in an odd ($i = 1$) CPR message ($60 - 1 = 59$).
pub const LATITUDE_ZONES_ODD: u32 = 59;

/// Even latitude zone width $\Delta\text{Lat}_0$ in whole degrees ($6.0^\circ$).
pub const DLAT_EVEN_DEGREES: f64 = 360.0 / 60.0;

/// Odd latitude zone width $\Delta\text{Lat}_1$ in degrees ($360 / 59^\circ \approx 6.1016949^\circ$).
pub const DLAT_ODD_DEGREES: f64 = 360.0 / 59.0;

/// Even latitude zone width in micro-degrees ($6{,}000{,}000\,\mu^\circ$).
pub const DLAT_EVEN_MICRODEGREES: i32 = 6_000_000;

/// Fixed 60-entry precomputed latitude boundary table in micro-degrees ($1^\circ = 1{,}000{,}000\,\mu^\circ$).
///
/// Indexed by zone count $NL \in [1, 59]$ (index `0` unused). Entry `NL_TRANSITION_TABLE[nl]` is the upper
/// boundary for zone count `nl` in DO-260B §2.2.3.2.5.
pub const NL_TRANSITION_TABLE: [i32; 60] = [
    0, 90_000_000, 87_000_000, 86_535_370, 85_755_416, 84_891_662, 83_991_736, 83_071_994,
    82_139_570, 81_198_013, 80_249_232, 79_294_282, 78_333_741, 77_367_895, 76_396_844, 75_420_563,
    74_438_934, 73_451_774, 72_458_845, 71_459_865, 70_454_511, 69_442_426, 68_423_220, 67_396_468,
    66_361_710, 65_318_453, 64_266_165, 63_204_275, 62_132_167, 61_049_178, 59_954_593, 58_847_638,
    57_727_474, 56_593_188, 55_443_784, 54_278_175, 53_095_162, 51_893_425, 50_671_502, 49_427_764,
    48_160_391, 46_867_333, 45_546_267, 44_194_550, 42_809_140, 41_386_518, 39_922_567, 38_412_419,
    36_850_251, 35_228_996, 33_539_934, 31_772_097, 29_911_357, 27_938_987, 25_829_247, 23_545_045,
    21_029_395, 18_186_264, 14_828_174, 10_470_471,
];

/// Computes the number of longitude zones $NL \in [1, 59]$ for raw latitude micro-degrees.
#[must_use]
pub const fn cpr_nl_from_microdegrees(microdegrees: i32) -> u8 {
    let abs_lat = microdegrees.unsigned_abs() as i32;
    let mut nl = 59;
    while nl > 1 {
        if abs_lat < NL_TRANSITION_TABLE[nl] {
            return nl as u8;
        }
        nl -= 1;
    }
    1
}

/// Computes the number of longitude zones $NL \in [1, 59]$ for a [`Latitude`].
#[must_use]
pub const fn cpr_nl(lat: Latitude) -> u8 {
    cpr_nl_from_microdegrees(lat.microdegrees())
}

/// Computes the effective longitude zone count $N(lat, i)$ for a given parity ($i \in \{0, 1\}$).
///
/// Returns $NL(lat)$ for even frames (`is_odd = false`) and $\max(1, NL(lat) - 1)$ for odd frames.
#[must_use]
pub const fn cpr_n(lat: Latitude, is_odd: bool) -> u8 {
    let nl = cpr_nl(lat);
    if is_odd {
        if nl > 1 { nl - 1 } else { 1 }
    } else {
        nl
    }
}

/// Returns the longitude zone width $\Delta\text{Lon}$ in degrees for a given latitude and parity.
#[must_use]
pub fn dlon_degrees(lat: Latitude, is_odd: bool) -> f64 {
    360.0 / f64::from(cpr_n(lat, is_odd))
}
