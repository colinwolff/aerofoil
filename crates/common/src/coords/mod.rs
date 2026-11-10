//! Fixed-point geographic coordinates in micro-degrees (WGS-84).
//!
//! Latitude and longitude are stored as integer micro-degrees ($1^\circ = 1{,}000{,}000\,\mu^\circ$).
//! In accordance with `docs/SPEC.md` Invariant 9, no floating-point value is ever the stored form
//! of a position. This guarantees bit-identical results across architectures, avoids rounding drift,
//! and enables formatting without dynamic heap allocation.
//!
//! Out-of-range coordinates are refused on construction (`docs/SPEC.md` §6, "no silent repair").

mod lat;
mod lon;
mod pos;

pub use lat::Latitude;
pub use lon::Longitude;
pub use pos::Position;
