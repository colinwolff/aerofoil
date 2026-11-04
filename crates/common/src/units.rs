//! Canonical unit types: altitude, Mode A identity (squawk) and heading.
//!
//! All three are fixed-point integers. No float is ever the stored form — the same rule
//! `docs/SPEC.md` Invariant 9 states for positions, applied here so the values stay bit-exact across
//! targets and formattable without an allocator.
//!
//! Constructors validate and return `Option`: a value that falls outside the representable domain is
//! refused rather than clamped (`docs/SPEC.md` §6, "no silent repair").

use core::fmt;

/// What an altitude is measured against.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum AltitudeKind {
    /// Pressure altitude referenced to 1013.25 hPa, as Mode S transmits it.
    Barometric,
    /// Height above the WGS-84 ellipsoid, as UAT and ADS-B geometric reports carry it.
    Geometric,
}

/// An altitude in whole feet, and the datum it is measured against.
///
/// The representable range covers both protocols: the Mode S AC field spans −1000…50_175 ft in
/// 25 ft steps (ICAO Annex 10), and UAT geometric altitude reaches 100_000 ft (DO-282B). Each
/// decoder enforces its own narrower encoding; this type only refuses values no protocol can carry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Altitude {
    feet: i32,
    kind: AltitudeKind,
}

impl Altitude {
    /// Lowest representable altitude, in feet.
    pub const MIN_FEET: i32 = -1_000;
    /// Highest representable altitude, in feet.
    pub const MAX_FEET: i32 = 100_000;

    /// Returns `None` when `feet` lies outside [`Self::MIN_FEET`]..=[`Self::MAX_FEET`].
    #[must_use]
    pub const fn new(feet: i32, kind: AltitudeKind) -> Option<Self> {
        if feet < Self::MIN_FEET || feet > Self::MAX_FEET {
            return None;
        }
        Some(Self { feet, kind })
    }

    /// The altitude in whole feet.
    #[must_use]
    pub const fn feet(self) -> i32 {
        self.feet
    }

    /// The datum this altitude is measured against.
    #[must_use]
    pub const fn kind(self) -> AltitudeKind {
        self.kind
    }
}

impl fmt::Display for Altitude {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ft", self.feet)
    }
}

/// A Mode A identity code: four octal digits, `0000`–`7777`.
///
/// The code is twelve bits, so every in-range value is a legal four-digit octal code. A rendering
/// that packs digits into hex nibbles (where 8–F can appear) lands above [`Self::MAX`] and is
/// refused rather than reinterpreted as some other code.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Squawk(u16);

impl Squawk {
    /// Largest valid code (`7777` octal).
    pub const MAX: u16 = 0o7777;

    /// Returns `None` when `code` needs more than twelve bits.
    #[must_use]
    pub const fn new(code: u16) -> Option<Self> {
        if code > Self::MAX {
            return None;
        }
        Some(Self(code))
    }

    /// The code as a twelve-bit integer.
    #[must_use]
    pub const fn code(self) -> u16 {
        self.0
    }
}

impl fmt::Display for Squawk {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:04o}", self.0)
    }
}

/// A heading in units of 1/128 degree, `0.0`–`359.9`, as ADS-B transmits it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Heading(u16);

impl Heading {
    /// Number of raw units in a full turn (360 × 128).
    pub const UNITS_PER_TURN: u16 = 46_080;
    /// Last in-range raw value, `359.99` degrees.
    pub const UNIT_PER_TURN_LAST: u16 = Self::UNITS_PER_TURN - 1;

    /// Returns `None` when `raw` is not a heading: 360.0 degrees and beyond are refused.
    #[must_use]
    pub const fn from_raw_128ths(raw: u16) -> Option<Self> {
        if raw >= Self::UNITS_PER_TURN {
            return None;
        }
        Some(Self(raw))
    }

    /// The raw 1/128-degree value.
    #[must_use]
    pub const fn raw_128ths(self) -> u16 {
        self.0
    }

    /// Whole degrees, truncated toward zero.
    #[must_use]
    pub const fn whole_degrees(self) -> u16 {
        self.0 / 128
    }

    /// Tenths of a degree after the whole degrees, `0`–`9`.
    ///
    /// Integer arithmetic only: converting through a float would let the printed heading disagree
    /// with the transmitted value at the boundaries.
    #[must_use]
    pub const fn tenths(self) -> u16 {
        (self.0 % 128) * 10 / 128
    }
}

impl fmt::Display for Heading {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}.{}\u{00b0}", self.whole_degrees(), self.tenths())
    }
}
